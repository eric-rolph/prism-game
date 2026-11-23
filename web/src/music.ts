// Studio-Grade Adaptive Procedural Soundtrack Engine for Prism 2.0.
//
// Pure Web Audio API (zero external samples, strict CSP compliant):
//   - Procedural stereo algorithmic Hall/Plate Reverb (ConvolverNode)
//   - Warm analog tape saturation bus (WaveShaperNode)
//   - Kick-triggered sidechain pumping bus for modern electronic breath & punch
//   - Tempo-locked stereo ping-pong delay (auto-tracks live dynamic BPM)
//   - 7 vertical reactive musical stems responding in real time to:
//       * Live pace (Wave, Swarm Density, Kill Velocity) -> dynamic BPM + stem crossfade
//       * Resonance Surge Power-Up (Tiers I-IV) -> Power-Chords, Octave Lead, Ride & Filter Open
//       * Prismatic Dead-Eye Slow-Mo -> underwater lowpass dive + tempo stretch + slam-open drop
//       * Hostile Pink Ghost Sniper Lock -> staccato radar-pizzicato tension ostinato
//       * 6 Bosses & Boss Phases -> 3 bespoke Boss Themes (including 7/8 odd-meter Paradox!)
//       * Golden Prism Obelisk Capture -> swelling formant choir pad
//       * Low Hull Danger -> urgent sub-bass heartbeat pulse

const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export interface MusicGameState {
  isTitle: boolean;
  energy: number;          // 0..1 overall combat intensity
  wave: number;            // 0..30+
  enemyDensity: number;    // 0..1 active enemy crowd pressure
  killRate: number;        // 0..1 recent kills/sec intensity
  surgeTier: number;       // 0..4 Resonance Surge power-up tier
  bossActive: boolean;
  bossKind: number;        // 0=Sentinel, 1=Hydra, 2=VoidPrism, 3=Lattice, 4=MirrorSovereign, 5=ChronoEclipse
  bossHpPct: number;       // 0..1 remaining boss HP
  ghostActive: boolean;    // Pink Ghost Sniper currently targeting player
  ghostImminent: boolean;  // Ghost Sniper about to fire (<30% lock time)
  deadeyeActive: boolean;  // RMB 0.32x time-dilation active
  obeliskProgress: number; // 0..1 Obelisk capture progress
  lowHp: number;           // 0..1 danger factor (<35% HP)
}

interface ChordBar {
  bass: number;          // MIDI root/inversion bass note (octave 2-3)
  voicing: number[];     // 5-note smooth voice-led pad/arp voicing (octave 4-5)
  scale: number[];       // Consonant pitch classes (mod 12) for melody & SFX
  stab?: boolean;        // Accent brass/chord stab bar
  turnaround?: boolean;  // Cadential bar with extra bass motion & riser
}

interface Movement {
  id: string;
  name: string;
  modeLabel: string;
  bpm: number;
  stepsPerBar: number;    // 16 for 4/4, 14 for 7/8 progressive odd-meter!
  swing: number;
  tonicMidi: number;
  drumStyle: 'prog' | 'liquid' | 'baroque' | 'cinematic' | 'anthem' | 'boss_iron' | 'boss_78' | 'boss_apoc';
  bars: ChordBar[];       // 8 composed bars
  bassA: number[];        // Main bar bassline (offsets from bar.bass, -1=rest, -2=glide-to-next)
  bassB: number[];        // Variation / turnaround bar bassline
  arpOrder: number[];     // Polyrhythmic voicing indices (-1=rest, +5 = octave up)
  melodyA: (number | null)[];   // Bars 0..1 (stepsPerBar * 2)
  melodyB: (number | null)[];   // Bars 2..3
  melodyC: (number | null)[];   // Bars 4..5 (second-half evolution!)
  melodyD: (number | null)[];   // Bars 6..7 (climactic answer!)
  counter: (number | null)[];   // Independent 1-bar mid-register countermelody answering gaps
}

// ── 5 Evolving Action Movements (Risk of Rain 2 × Hades × Furi × Bach) ────

const MOVEMENTS: Movement[] = [
  // I. Nebula Awakening — D Dorian Progressive Synth-Rock (118 BPM, dynamic build from taut pulse to soaring anthem)
  {
    id: 'nebula',
    name: 'I. NEBULA AWAKENING',
    modeLabel: 'D DORIAN',
    bpm: 118,
    stepsPerBar: 16,
    swing: 0.006,
    tonicMidi: 62,
    drumStyle: 'prog',
    bars: [
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 11, 0] },                // Dm9
      { bass: 40, voicing: [60, 64, 67, 71, 74], scale: [0, 2, 4, 5, 7, 9, 11] },                // Cmaj9/E
      { bass: 41, voicing: [60, 64, 69, 72, 76], scale: [5, 7, 9, 11, 0, 2, 4], stab: true },    // Fmaj7#11
      { bass: 43, voicing: [62, 67, 71, 74, 76], scale: [7, 9, 11, 0, 2, 4, 5], turnaround: true }, // G6/9
      { bass: 46, voicing: [62, 65, 69, 70, 74], scale: [10, 0, 2, 5, 7, 9] },                   // Bbmaj7
      { bass: 43, voicing: [62, 65, 67, 70, 74], scale: [7, 9, 10, 0, 2, 5], stab: true },       // Gm9
      { bass: 45, voicing: [62, 64, 69, 71, 76], scale: [9, 11, 0, 2, 4, 7] },                   // Asus4(9)
      { bass: 45, voicing: [61, 64, 67, 70, 76], scale: [9, 10, 1, 2, 4, 7], stab: true, turnaround: true }, // A7b9
    ],
    bassA: [0, -1, 0, 12, -1, 7, 0, -1, 0, 12, -1, 7, 10, -1, 7, 12],
    bassB: [0, 12, 0, 7, 10, -1, 12, 7, 0, 12, 7, 10, 12, 14, 12, 7],
    // 3-against-16 dotted-8th polyrhythmic pulse!
    arpOrder: [0, 2, 4, 1, 3, 5, 2, 4, 0, 3, 5, 1, 4, 2, 6, 3],
    melodyA: [
      7, null, null, 9, 7, null, 5, 4,      2, null, 4, null, 7, null, null, null,
      9, null, 11, null, 12, null, 9, 7,    5, null, 7, 5, 4, null, null, null,
    ],
    melodyB: [
      12, null, 11, 9, 7, null, 9, null,    5, null, 4, 2, 0, null, 2, 4,
      7, null, 9, 11, 12, null, 14, null,   12, null, 9, 7, 5, null, 4, null,
    ],
    melodyC: [
      14, null, 12, null, 10, 9, 7, null,   10, null, 9, 7, 5, null, 7, 9,
      12, null, 10, 9, 7, null, 5, 4,       7, null, 9, null, 11, null, null, null,
    ],
    melodyD: [
      12, 11, 9, 7, 9, null, 12, null,      14, null, 16, 14, 12, null, 9, null,
      7, 9, 10, 9, 7, 5, 4, 2,              1, null, 4, 7, 9, null, 12, null,
    ],
    counter: [null, null, 0, null, null, 2, null, 4, null, 5, null, null, 4, null, 2, null],
  },

  // II. Spectral Velocity — F# Dorian Liquid DnB / French Electro (126 BPM, driving breakbeat + slap bass!)
  {
    id: 'velocity',
    name: 'II. SPECTRAL VELOCITY',
    modeLabel: 'F# DORIAN · LIQUID',
    bpm: 126,
    stepsPerBar: 16,
    swing: 0.004,
    tonicMidi: 66, // F#4
    drumStyle: 'liquid',
    bars: [
      { bass: 42, voicing: [66, 69, 73, 76, 80], scale: [6, 8, 9, 11, 1, 3, 4] },                 // F#m9
      { bass: 45, voicing: [64, 69, 73, 76, 80], scale: [9, 11, 1, 3, 4, 6, 8], stab: true },     // Amaj9
      { bass: 47, voicing: [66, 71, 75, 78, 80], scale: [11, 1, 3, 4, 6, 8, 9] },                 // B6/9 (Dorian IV!)
      { bass: 40, voicing: [64, 68, 71, 75, 78], scale: [4, 6, 8, 9, 11, 1, 3], turnaround: true }, // Emaj9
      { bass: 44, voicing: [66, 68, 71, 75, 78], scale: [8, 9, 11, 1, 3, 4, 6] },                 // G#m9
      { bass: 45, voicing: [64, 69, 73, 76, 80], scale: [9, 11, 1, 3, 4, 6, 8], stab: true },     // Amaj7#11
      { bass: 47, voicing: [66, 69, 71, 75, 78], scale: [11, 1, 3, 4, 6, 8, 9] },                 // B13
      { bass: 49, voicing: [65, 68, 71, 74, 80], scale: [1, 2, 5, 6, 8, 11], stab: true, turnaround: true }, // C#7b9
    ],
    bassA: [0, 12, -1, 0, 7, -1, 12, 0, -1, 12, 0, 7, 10, 12, -1, 7],
    bassB: [0, 12, 7, 12, 0, 10, 12, 7, 0, 12, 7, 10, 12, 15, 14, 12],
    arpOrder: [0, 3, 1, 4, 5, 2, 4, 1, 0, 4, 2, 5, 3, 1, 6, 4],
    melodyA: [
      0, null, 3, 5, 7, null, 10, null,     9, 7, 5, 3, 5, null, null, null,
      3, null, 7, 9, 12, null, 10, 9,       7, null, 5, 3, 2, null, null, null,
    ],
    melodyB: [
      7, 9, 12, null, 14, null, 12, 10,     9, null, 7, 5, 7, null, 10, null,
      12, null, 14, 15, 14, 12, 10, 9,      7, null, 9, null, 12, null, null, null,
    ],
    melodyC: [
      15, null, 14, 12, 10, null, 9, 7,     10, null, 12, 14, 15, null, 12, null,
      14, 12, 10, 9, 7, null, 5, 3,         7, null, 9, 10, 12, null, null, null,
    ],
    melodyD: [
      12, null, 15, 14, 12, 10, 9, 7,       9, 10, 12, 14, 15, null, 17, null,
      15, 14, 12, 10, 9, 7, 5, 3,           2, null, 5, 7, 11, null, 12, null,
    ],
    counter: [null, 4, null, 7, null, null, 5, null, 4, null, 2, null, 0, null, 4, null],
  },

  // III. Baroque Reactor — D Harmonic Minor Neoclassical Electro-Metal (128 BPM, Bach descending bass + shredding!)
  {
    id: 'baroque',
    name: 'III. BAROQUE REACTOR',
    modeLabel: 'D HARMONIC MINOR',
    bpm: 128,
    stepsPerBar: 16,
    swing: 0.0,
    tonicMidi: 62,
    drumStyle: 'baroque',
    bars: [
      { bass: 38, voicing: [62, 65, 69, 74, 77], scale: [2, 4, 5, 7, 9, 10, 1] },                // Dm
      { bass: 36, voicing: [60, 65, 69, 74, 77], scale: [0, 2, 4, 5, 7, 9, 10] },                // Dm/C
      { bass: 34, voicing: [62, 65, 69, 70, 74], scale: [10, 0, 2, 5, 7, 9], stab: true },       // Bbmaj7
      { bass: 37, voicing: [61, 64, 67, 69, 73], scale: [1, 2, 4, 7, 9, 10], turnaround: true }, // A7/C#
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 0] },                    // Dm9
      { bass: 46, voicing: [62, 67, 70, 74, 79], scale: [7, 9, 10, 0, 2, 5], stab: true },       // Gm/Bb
      { bass: 40, voicing: [62, 64, 67, 70, 74], scale: [4, 5, 7, 9, 10, 2] },                   // Eø7
      { bass: 45, voicing: [61, 64, 67, 70, 73], scale: [9, 10, 1, 2, 4, 7], stab: true, turnaround: true }, // A7b9
    ],
    bassA: [0, 12, 7, 12, 0, 12, 7, 12, 0, 12, 7, 12, 0, 7, 10, 12],
    bassB: [0, 0, 12, 7, 0, 12, 10, 7, 0, 0, 12, 7, 10, 12, 13, 12],
    arpOrder: [0, 1, 2, 4, 5, 3, 2, 4, 0, 2, 3, 5, 4, 2, 1, 3],
    melodyA: [
      7, 5, 4, 5, 7, null, 12, null,        10, 9, 7, 9, 10, null, 7, null,
      5, 4, 2, 4, 5, 7, 9, 10,              12, null, 11, null, 9, null, null, null,
    ],
    melodyB: [
      12, 10, 9, 7, 5, 7, 9, 12,            14, null, 12, 10, 9, null, 7, null,
      10, 9, 7, 5, 4, 5, 7, 4,              1, null, 4, 7, 9, 12, 13, null,
    ],
    melodyC: [
      14, 12, 10, 12, 14, null, 17, null,   15, 14, 12, 14, 15, null, 12, null,
      10, 9, 7, 9, 10, 12, 14, 15,          16, null, 14, 12, 11, null, 9, null,
    ],
    melodyD: [
      17, 15, 14, 12, 10, 12, 14, 15,       14, 12, 10, 9, 7, 9, 10, 12,
      10, 9, 7, 5, 4, 2, 1, 4,              7, 9, 10, 12, 13, 14, 16, null,
    ],
    counter: [0, null, 4, null, 7, null, 5, null, 4, null, 2, null, 1, null, 4, null],
  },

  // IV. Chromatic Drift — Neo-Riemannian Chromatic Mediants & Half-Time Cinema Drop (122 BPM)
  {
    id: 'chromatic',
    name: 'IV. CHROMATIC DRIFT',
    modeLabel: 'NEO-RIEMANNIAN',
    bpm: 122,
    stepsPerBar: 16,
    swing: 0.008,
    tonicMidi: 62,
    drumStyle: 'cinematic',
    bars: [
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 0] },                    // Dm9
      { bass: 42, voicing: [61, 65, 66, 70, 73], scale: [6, 8, 10, 1, 3, 5], stab: true },       // F#maj7 (chromatic mediant)
      { bass: 47, voicing: [61, 62, 66, 69, 73], scale: [11, 1, 2, 4, 6, 9] },                   // Bm9
      { bass: 43, voicing: [61, 62, 67, 71, 74], scale: [7, 9, 11, 1, 2, 4], turnaround: true }, // Gmaj7#11
      { bass: 39, voicing: [62, 63, 67, 70, 74], scale: [3, 5, 7, 9, 10, 2], stab: true },       // Ebmaj7 (Neapolitan bII)
      { bass: 36, voicing: [62, 63, 67, 70, 74], scale: [0, 2, 3, 5, 7, 10] },                   // Cm9
      { bass: 45, voicing: [62, 64, 69, 71, 76], scale: [9, 11, 0, 2, 4, 7] },                   // Asus4(9)
      { bass: 45, voicing: [61, 64, 67, 72, 76], scale: [9, 10, 0, 1, 4, 7], stab: true, turnaround: true }, // A7#9
    ],
    bassA: [0, -1, -1, 0, -1, 7, 12, -1, 0, -1, 7, -1, 12, 10, 7, -1],
    bassB: [0, -1, 12, 0, 7, -1, 12, 10, 0, 7, 12, -1, 14, 12, 10, 7],
    arpOrder: [0, -1, 2, 4, 5, -1, 3, 1, 0, 2, 5, 4, 3, 1, 6, 4],
    melodyA: [
      9, null, null, 7, 5, null, 4, null,   8, null, null, 10, 13, null, 11, null,
      9, null, 6, null, 4, null, 2, null,   7, null, 9, null, 11, null, null, null,
    ],
    melodyB: [
      10, null, null, 8, 7, null, 5, null,  7, null, 10, null, 12, null, 10, 8,
      9, null, 7, null, 5, null, 4, null,   7, null, 10, null, 12, null, null, null,
    ],
    melodyC: [
      14, null, 12, 9, 12, null, 14, null,  13, null, 11, 10, 8, null, 13, null,
      11, null, 9, 6, 4, null, 9, null,     11, null, 14, null, 16, null, null, null,
    ],
    melodyD: [
      15, null, 14, 12, 10, null, 12, 14,   15, null, 12, 10, 8, null, 7, null,
      9, null, 11, 12, 14, null, 12, 9,     7, null, 10, 12, 15, null, 16, null,
    ],
    counter: [null, null, 5, null, 4, null, null, 2, null, 4, null, 7, null, null, 5, null],
  },

  // V. Hyper-Prism Overdrive — E Dorian / Phrygian Cyber-Symphonic Climax (134 BPM!)
  {
    id: 'anthem',
    name: 'V. HYPER-PRISM OVERDRIVE',
    modeLabel: 'E DORIAN · ANTHEM',
    bpm: 134,
    stepsPerBar: 16,
    swing: 0.0,
    tonicMidi: 64, // E4
    drumStyle: 'anthem',
    bars: [
      { bass: 40, voicing: [64, 67, 71, 74, 78], scale: [4, 6, 7, 9, 11, 1, 2] },                 // Em9
      { bass: 48, voicing: [64, 67, 71, 74, 78], scale: [0, 2, 4, 6, 7, 9, 11], stab: true },     // Cmaj9#11
      { bass: 45, voicing: [64, 69, 73, 76, 79], scale: [9, 11, 1, 2, 4, 6, 7] },                 // A13 (Dorian IV)
      { bass: 47, voicing: [66, 71, 74, 78, 81], scale: [11, 1, 2, 4, 6, 7, 9], turnaround: true }, // Bm11
      { bass: 43, voicing: [64, 67, 71, 74, 78], scale: [7, 9, 11, 1, 2, 4, 6], stab: true },     // Gmaj9
      { bass: 42, voicing: [64, 66, 69, 73, 76], scale: [6, 7, 9, 11, 1, 2, 4] },                 // F#m11
      { bass: 48, voicing: [64, 67, 71, 74, 78], scale: [0, 2, 4, 6, 7, 9, 11] },                 // Cmaj9#11
      { bass: 47, voicing: [63, 66, 69, 72, 78], scale: [11, 0, 3, 4, 6, 9], stab: true, turnaround: true }, // B7b9
    ],
    bassA: [0, 12, 0, 12, 0, 7, 12, 7, 0, 12, 0, 12, 10, 12, 7, 12],
    bassB: [0, 12, 7, 12, 10, 12, 0, 7, 0, 12, 7, 10, 12, 14, 15, 12],
    arpOrder: [0, 2, 4, 5, 1, 3, 5, 4, 0, 4, 2, 5, 3, 6, 4, 2],
    melodyA: [
      0, null, 3, 5, 7, null, 10, 7,        9, null, 7, 5, 3, null, 2, null,
      0, 3, 5, 7, 10, null, 12, 10,         9, null, 7, 5, 7, null, null, null,
    ],
    melodyB: [
      12, null, 10, 9, 7, null, 5, 3,       7, null, 9, 10, 12, null, 14, null,
      12, 10, 9, 7, 5, 7, 9, 10,            12, null, 15, null, 14, null, null, null,
    ],
    melodyC: [
      15, null, 14, 12, 10, null, 12, 14,   15, null, 17, 15, 14, null, 12, null,
      10, 12, 14, 12, 10, 9, 7, 5,          7, null, 10, 12, 14, null, null, null,
    ],
    melodyD: [
      19, null, 17, 15, 14, null, 12, 10,   12, 14, 15, 17, 19, null, 15, null,
      14, 12, 10, 9, 7, 5, 3, 2,            3, null, 7, 10, 11, null, 12, null,
    ],
    counter: [7, null, 5, null, 3, null, 7, null, 5, null, 3, null, 2, null, 5, null],
  },
];

// ── 3 Bespoke Boss Themes Across All 6 Multi-Phase Bosses ─────────────────

// Boss A: Lattice & Sentinel — Industrial Phrygian Dominant War-Groove (136 BPM, 4/4)
const BOSS_IRON: Movement = {
  id: 'boss_iron',
  name: 'BOSS · IRON GEOMETRY',
  modeLabel: 'D PHRYGIAN DOM',
  bpm: 136,
  stepsPerBar: 16,
  swing: 0.0,
  tonicMidi: 62,
  drumStyle: 'boss_iron',
  bars: [
    { bass: 38, voicing: [62, 66, 69, 72, 75], scale: [2, 3, 6, 7, 9, 10, 0], stab: true },
    { bass: 39, voicing: [63, 67, 70, 74, 78], scale: [3, 6, 7, 9, 10, 0, 2] },
    { bass: 36, voicing: [62, 63, 67, 70, 74], scale: [0, 2, 3, 5, 7, 10], stab: true },
    { bass: 39, voicing: [62, 63, 67, 70, 74], scale: [3, 5, 7, 9, 10, 2], turnaround: true },
    { bass: 43, voicing: [62, 65, 67, 70, 74], scale: [7, 9, 10, 0, 2, 3], stab: true },
    { bass: 42, voicing: [60, 63, 66, 69, 72], scale: [6, 7, 9, 10, 0, 3] },
    { bass: 39, voicing: [63, 67, 70, 74, 78], scale: [3, 6, 7, 9, 10, 2], stab: true },
    { bass: 45, voicing: [61, 64, 67, 70, 73], scale: [9, 10, 1, 2, 4, 7], stab: true, turnaround: true },
  ],
  bassA: [0, 0, 12, 0, 1, 0, 12, 7, 0, 0, 12, 0, 1, 12, 7, 1],
  bassB: [0, 1, 0, 12, 7, 1, 0, 12, 0, 1, 4, 7, 12, 13, 12, 7],
  arpOrder: [0, 3, 1, 4, 5, 2, 4, 1, 0, 4, 2, 5, 3, 1, 6, 4],
  melodyA: [
    0, 1, 4, null, 5, 4, 1, 0,              7, null, 8, 7, 5, 4, 1, null,
    0, 1, 4, 5, 7, 8, 7, 5,                 4, null, 1, null, 0, null, null, null,
  ],
  melodyB: [
    12, 13, 12, 10, 8, 7, 5, 4,             7, null, 8, 10, 12, null, 13, null,
    12, 8, 7, 5, 4, 1, 4, 5,                7, null, 10, 8, 7, 4, 1, null,
  ],
  melodyC: [
    7, 8, 12, null, 13, 12, 8, 7,           10, null, 12, 13, 16, null, 13, 12,
    8, 7, 5, 4, 5, 7, 8, 10,                12, null, 8, 7, 4, null, 1, null,
  ],
  melodyD: [
    16, 13, 12, 10, 8, 7, 8, 12,            13, 12, 10, 8, 7, 5, 4, 1,
    0, 4, 7, 8, 12, 13, 16, 17,             16, null, 13, 12, 8, 7, 4, null,
  ],
  counter: [0, null, 1, null, 4, null, 7, null, 8, null, 7, null, 4, null, 1, null],
};

// Boss B: Mirror Sovereign & Chrono Eclipse — 7/8 Odd-Meter Progressive Paradox (138 BPM, 14 steps/bar: 3+2+2+3+2+2!)
const BOSS_PARADOX_78: Movement = {
  id: 'boss_78',
  name: 'BOSS · CHRONO PARADOX [7/8]',
  modeLabel: 'C# LOCRIAN / PHRYGIAN 7/8',
  bpm: 138,
  stepsPerBar: 14,
  swing: 0.0,
  tonicMidi: 61, // C#4
  drumStyle: 'boss_78',
  bars: [
    { bass: 37, voicing: [61, 64, 68, 71, 74], scale: [1, 2, 4, 6, 8, 9, 11], stab: true },    // C#m7b9
    { bass: 38, voicing: [62, 66, 69, 73, 76], scale: [2, 4, 6, 8, 9, 11, 1] },                // Dmaj9#11
    { bass: 40, voicing: [64, 67, 71, 74, 78], scale: [4, 6, 7, 9, 11, 1, 2], stab: true },    // Em9
    { bass: 44, voicing: [63, 66, 68, 72, 75], scale: [8, 9, 0, 1, 3, 6], turnaround: true },  // G#7b9
    { bass: 37, voicing: [61, 64, 68, 71, 76], scale: [1, 2, 4, 6, 8, 9, 11] },                // C#m11
    { bass: 42, voicing: [61, 66, 69, 73, 76], scale: [6, 8, 9, 11, 1, 2, 4], stab: true },    // F#m9
    { bass: 38, voicing: [62, 66, 69, 73, 78], scale: [2, 4, 6, 8, 9, 11, 1] },                // Dmaj9
    { bass: 44, voicing: [62, 66, 68, 72, 75], scale: [8, 9, 0, 1, 3, 6], stab: true, turnaround: true }, // G#7alt
  ],
  // 14 steps (7/8 grouped 3 + 3 + 2 + 3 + 3!)
  bassA: [0, -1, 12, 0, -1, 7, 0, 12, 0, -1, 1, 0, 7, 12],
  bassB: [0, 12, 7, 0, 12, 1, 0, 7, 12, 0, 1, 7, 10, 12],
  arpOrder: [0, 2, 4, 1, 3, 5, 2, 4, 0, 3, 5, 4, 2, 6],
  // 28 steps (2 bars of 14 steps!)
  melodyA: [
    0, null, 3, 7, null, 8, 7,  3, null, 1, 0, null, 7, null,
    8, null, 7, 3, null, 1, 3,  7, null, 10, 8, null, 7, null,
  ],
  melodyB: [
    12, null, 10, 8, null, 7, 8, 12, null, 13, 12, null, 8, null,
    7, null, 8, 7, null, 3, 1,   3, null, 7, 8, null, 12, null,
  ],
  melodyC: [
    12, 13, 15, null, 12, 10, 8, 10, 12, 8, 7, null, 3, null,
    7, 8, 12, null, 15, 13, 12,  10, 8, 7, 8, null, 12, null,
  ],
  melodyD: [
    15, null, 13, 12, 10, 8, 7,  8, 10, 12, 13, 15, 17, null,
    15, 13, 12, 8, 7, 3, 1,      0, 3, 7, 8, 11, 12, null,
  ],
  counter: [0, null, null, 7, null, 8, null, 3, null, 1, null, 7, null, 10],
};

// Boss C: Chromatic Hydra & Void Prism Apex — Symphonic Cyber-Metal Finale (142 BPM!)
const BOSS_APOCALYPSE: Movement = {
  id: 'boss_apoc',
  name: 'BOSS · VOID APOCALYPSE',
  modeLabel: 'C# HARMONIC / PHRYGIAN',
  bpm: 142,
  stepsPerBar: 16,
  swing: 0.0,
  tonicMidi: 61,
  drumStyle: 'boss_apoc',
  bars: [
    { bass: 37, voicing: [61, 64, 68, 73, 76], scale: [1, 3, 4, 6, 8, 9, 0], stab: true },
    { bass: 35, voicing: [61, 63, 66, 71, 75], scale: [11, 1, 3, 4, 6, 8, 9] },
    { bass: 33, voicing: [61, 64, 69, 73, 76], scale: [9, 11, 0, 1, 4, 6, 8], stab: true },
    { bass: 32, voicing: [60, 63, 66, 68, 72], scale: [8, 9, 0, 1, 3, 6], turnaround: true },
    { bass: 37, voicing: [61, 64, 68, 71, 75], scale: [1, 2, 4, 6, 8, 9, 11], stab: true },
    { bass: 38, voicing: [62, 66, 69, 73, 78], scale: [2, 4, 6, 8, 9, 11, 1] },
    { bass: 36, voicing: [60, 63, 66, 69, 72], scale: [0, 1, 3, 6, 8, 9], stab: true },
    { bass: 44, voicing: [60, 63, 66, 69, 75], scale: [8, 9, 0, 1, 3, 6], stab: true, turnaround: true },
  ],
  bassA: [0, 0, 12, 0, 0, 7, 12, 0, 0, 1, 12, 0, 7, 12, 10, 7],
  bassB: [0, 0, 12, 7, 0, 0, 12, 10, 0, 1, 3, 7, 10, 12, 13, 15],
  arpOrder: [0, 4, 2, 5, 1, 4, 3, 5, 0, 3, 5, 2, 4, 6, 3, 1],
  melodyA: [
    7, 8, 7, 4, 7, null, 12, null,          11, 12, 11, 8, 7, null, 4, null,
    3, 4, 7, 8, 11, 12, 15, null,           14, 12, 11, 8, 7, null, null, null,
  ],
  melodyB: [
    12, null, 15, 14, 12, 11, 8, 7,         8, 11, 12, 15, 16, null, 15, null,
    12, 11, 8, 7, 4, 3, 4, 7,               8, null, 11, null, 12, null, null, null,
  ],
  melodyC: [
    16, 15, 12, 15, 16, null, 19, null,     18, 16, 15, 12, 11, null, 8, null,
    7, 8, 11, 12, 15, 16, 18, 19,           20, null, 19, 16, 15, null, 12, null,
  ],
  melodyD: [
    19, 16, 15, 12, 15, 12, 11, 8,          11, 8, 7, 4, 7, 4, 3, 0,
    1, 4, 7, 8, 11, 12, 15, 16,             19, null, 16, 15, 12, 11, 8, null,
  ],
  counter: [0, 4, null, 7, 8, null, 7, 4, 3, null, 7, 8, 11, null, 8, 4],
};

function selectBossMovement(bossKind: number): Movement {
  if (bossKind === 4 || bossKind === 5) return BOSS_PARADOX_78; // Mirror Sovereign & Chrono Eclipse
  if (bossKind === 1 || bossKind === 2) return BOSS_APOCALYPSE; // Chromatic Hydra & Void Prism
  return BOSS_IRON;                                              // Prism Lattice & Prism Sentinel
}

/** Procedurally synthesizes a lush stereo hall/plate impulse response for ConvolverNode! */
function buildStudioReverbIR(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.0);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    let seed = ch === 0 ? 133791 : 987643;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 0xffffffff) * 2 - 1;
      const t = i / sr;
      // Smooth one-pole lowpass damping that darkens the reverb tail naturally.
      const damp = Math.max(0.08, 0.42 - t * 0.16);
      lp += (white - lp) * damp;
      const early = i < sr * 0.045 && (i % (ch === 0 ? 419 : 521) < 12) ? 0.55 : 0.0;
      const env = Math.exp(-t * 2.35) * (1 - Math.exp(-t * 65));
      data[i] = (lp * env + early * lp * 0.4) * 0.42;
    }
  }
  return buf;
}

/** Warm analog soft-clipper curve for rich harmonic glue without harsh clipping. */
function buildTapeCurve(): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * 1.45) / Math.tanh(1.45);
  }
  return curve;
}

export class MusicEngine {
  private ctx: AudioContext;
  private musicGain: GainNode;
  private masterFilter: BiquadFilterNode;
  private tapeSaturator: WaveShaperNode;
  private drumBus: GainNode;
  private sidechainBus: GainNode;
  private leadBus: GainNode;
  private delaySend: GainNode;
  private delayL: DelayNode;
  private delayR: DelayNode;
  private reverbSend: GainNode;
  private noiseBuf: AudioBuffer;

  private timerId: number | null = null;
  private nextStepTime = 0;
  private stepInBar = 0;
  private barInMov = 0;
  private movCycles = 0;
  private movIndex = 0;
  private activeMov: Movement = MOVEMENTS[0]!;
  private prevBassHz = 0;
  private prevLeadHz = 0;
  private wasDeadeye = false;

  private state: MusicGameState = {
    isTitle: true,
    energy: 0.12,
    wave: 0,
    enemyDensity: 0,
    killRate: 0,
    surgeTier: 0,
    bossActive: false,
    bossKind: -1,
    bossHpPct: 1,
    ghostActive: false,
    ghostImminent: false,
    deadeyeActive: false,
    obeliskProgress: 0,
    lowHp: 0,
  };

  private muted = false;
  private ducked = false;
  private running = false;
  private phraseVar = 0;

  constructor(ctx: AudioContext, destination: AudioNode, noiseBuf: AudioBuffer) {
    this.ctx = ctx;
    this.noiseBuf = noiseBuf;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.62;
    this.musicGain.connect(destination);

    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 18000;
    this.masterFilter.Q.value = 0.75;
    this.masterFilter.connect(this.musicGain);

    this.tapeSaturator = ctx.createWaveShaper();
    this.tapeSaturator.curve = buildTapeCurve();
    this.tapeSaturator.oversample = '2x';
    this.tapeSaturator.connect(this.masterFilter);

    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 1.0;
    this.drumBus.connect(this.tapeSaturator);

    this.sidechainBus = ctx.createGain();
    this.sidechainBus.gain.value = 1.0;
    this.sidechainBus.connect(this.tapeSaturator);

    this.leadBus = ctx.createGain();
    this.leadBus.gain.value = 1.0;
    this.leadBus.connect(this.tapeSaturator);

    // Studio Stereo Hall Reverb bus!
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.34;
    const convolver = ctx.createConvolver();
    convolver.buffer = buildStudioReverbIR(ctx);
    const revHp = ctx.createBiquadFilter();
    revHp.type = 'highpass';
    revHp.frequency.value = 180;
    this.reverbSend.connect(convolver);
    convolver.connect(revHp);
    revHp.connect(this.masterFilter);

    // Tempo-Locked Stereo Ping-Pong Delay!
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.25;

    this.delayL = ctx.createDelay(1.0);
    this.delayR = ctx.createDelay(1.0);
    this.delayL.delayTime.value = 0.36;
    this.delayR.delayTime.value = 0.48;

    const fL = ctx.createBiquadFilter();
    fL.type = 'bandpass';
    fL.frequency.value = 1750;
    fL.Q.value = 0.65;
    const fR = ctx.createBiquadFilter();
    fR.type = 'bandpass';
    fR.frequency.value = 2300;
    fR.Q.value = 0.65;

    const fbL = ctx.createGain();
    fbL.gain.value = 0.30;
    const fbR = ctx.createGain();
    fbR.gain.value = 0.27;

    const pL = ctx.createStereoPanner();
    pL.pan.value = -0.78;
    const pR = ctx.createStereoPanner();
    pR.pan.value = 0.78;

    this.delaySend.connect(this.delayL);
    this.delayL.connect(fL);
    fL.connect(pL);
    pL.connect(this.masterFilter);

    fL.connect(fbL);
    fbL.connect(this.delayR);
    this.delayR.connect(fR);
    fR.connect(pR);
    pR.connect(this.masterFilter);
    fR.connect(fbR);
    fbR.connect(this.delayL);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.timerId = window.setInterval(() => this.schedulerTick(), 22);
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

  /** Updates full live gameplay telemetry so every stem & tempo mirrors live action! */
  public setGameState(next: Partial<MusicGameState>): void {
    const prevDeadeye = this.state.deadeyeActive;
    Object.assign(this.state, next);
    this.state.energy = Math.max(0, Math.min(1, this.state.energy));
    this.state.enemyDensity = Math.max(0, Math.min(1, this.state.enemyDensity));
    this.state.killRate = Math.max(0, Math.min(1, this.state.killRate));
    this.state.lowHp = Math.max(0, Math.min(1, this.state.lowHp));

    // Slam back open with a punchy crash when exiting Prismatic Dead-Eye slow-mo!
    if (prevDeadeye && !this.state.deadeyeActive && !this.muted && this.ctx.state === 'running') {
      this.triggerImpactDrop();
    }
    this.wasDeadeye = this.state.deadeyeActive;
    this.syncBus();
  }

  /** Instant musical impact drop (used on Dead-Eye release, Surge IV ignition, Boss phase!). */
  public triggerImpactDrop(): void {
    if (this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    this.playCrash(t, 1.15, 0.095);
    this.playTaiko(t, 58, 0.24);
  }

  public effectiveBpm(): number {
    const s = this.state;
    const base = this.activeMov.bpm;
    if (s.isTitle) return Math.max(96, base - 16);
    const waveBoost = Math.min(9, s.wave * 0.42);
    const paceBoost = s.enemyDensity * 4.5 + s.killRate * 3.0;
    const surgeBoost = s.surgeTier * 2.2;
    const bossPhaseBoost = s.bossActive && s.bossHpPct < 0.45 ? 5.0 : 0;
    const raw = Math.min(156, base + waveBoost + paceBoost + surgeBoost + bossPhaseBoost);
    return s.deadeyeActive ? Math.max(76, raw * 0.64) : raw;
  }

  public getNowPlaying(): string {
    const bpm = Math.round(this.effectiveBpm());
    if (this.state.isTitle) return `AMBIENT · ${this.activeMov.name}`;
    const tag = this.state.deadeyeActive
      ? 'DEAD-EYE WARP'
      : this.state.surgeTier >= 3
        ? `SURGE ${this.state.surgeTier === 4 ? 'IV' : 'III'}`
        : this.state.ghostActive
          ? 'GHOST DUEL'
          : this.activeMov.modeLabel;
    return `${this.activeMov.name} · ${bpm} BPM · ${tag}`;
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
    const s = this.state;
    const targetGain = this.muted
      ? 0.0
      : this.ducked
        ? 0.24
        : s.deadeyeActive
          ? 0.48
          : 0.58 + Math.min(0.14, s.surgeTier * 0.03 + s.energy * 0.05);

    // Master filter opens dramatically with Surge / combat energy, and dives underwater during Dead-Eye!
    let cutoff = 18000;
    if (this.ducked) {
      cutoff = 540;
    } else if (s.deadeyeActive) {
      cutoff = 390;
    } else if (s.isTitle) {
      cutoff = 3200;
    } else {
      cutoff = 2600 + s.energy * 9000 + s.surgeTier * 2600 + (s.bossActive ? 3500 : 0);
      cutoff = Math.min(18500, cutoff);
    }

    const revWet = s.deadeyeActive ? 0.62 : s.isTitle ? 0.48 : 0.28 + s.surgeTier * 0.04;

    this.musicGain.gain.setTargetAtTime(targetGain, now, 0.07);
    this.masterFilter.frequency.setTargetAtTime(cutoff, now, s.deadeyeActive || this.wasDeadeye ? 0.045 : 0.14);
    this.masterFilter.Q.setTargetAtTime(s.deadeyeActive ? 2.4 : 0.75, now, 0.06);
    this.reverbSend.gain.setTargetAtTime(revWet, now, 0.12);

    // Lock stereo ping-pong delay mathematically to live BPM (dotted-8th & quarter note)!
    const stepDur = 60 / this.effectiveBpm() / 4;
    this.delayL.delayTime.setTargetAtTime(Math.min(0.85, stepDur * 3), now, 0.15);
    this.delayR.delayTime.setTargetAtTime(Math.min(0.95, stepDur * 4), now, 0.15);
  }

  private schedulerTick(): void {
    if (!this.running || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now - 0.35) {
      this.nextStepTime = now + 0.04;
    }
    const lookahead = 0.14;
    while (this.nextStepTime < now + lookahead) {
      this.scheduleStep(this.nextStepTime);
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    const stepDur = 60 / this.effectiveBpm() / 4;
    this.nextStepTime += stepDur;
    this.stepInBar = (this.stepInBar + 1) % this.activeMov.stepsPerBar;

    if (this.stepInBar === 0) {
      this.barInMov = (this.barInMov + 1) % this.activeMov.bars.length;

      // Seamless bar-boundary Boss Theme switch matched to the active Boss archetype!
      if (this.state.bossActive) {
        const desired = selectBossMovement(this.state.bossKind);
        if (this.activeMov.id !== desired.id) {
          this.activeMov = desired;
          this.barInMov = 0;
          this.movCycles = 0;
          this.triggerImpactDrop();
          return;
        }
      } else if (this.activeMov.id.startsWith('boss_')) {
        // Post-boss triumphant transition straight into a fresh high-energy movement!
        this.movIndex = (this.movIndex + 1) % MOVEMENTS.length;
        this.activeMov = MOVEMENTS[this.movIndex]!;
        this.barInMov = 0;
        this.movCycles = 0;
        this.triggerImpactDrop();
        return;
      }

      if (this.barInMov === 0) {
        this.movCycles++;
        this.phraseVar = (this.phraseVar + 1) % 4;
        const maxCycles = this.state.isTitle ? 1 : this.state.surgeTier >= 2 || this.state.energy > 0.6 ? 2 : 1;
        if (!this.state.bossActive && this.movCycles >= maxCycles) {
          this.movCycles = 0;
          if (this.state.isTitle) {
            this.movIndex = this.movIndex === 0 ? 3 : 0;
          } else {
            // Escalate through progressively richer movements aligned with wave pacing!
            if (this.state.wave >= 16 && this.movIndex === 0) {
              this.movIndex = 4; // Jump into Hyper-Prism Overdrive in late game
            } else {
              this.movIndex = (this.movIndex + 1) % MOVEMENTS.length;
            }
          }
          this.activeMov = MOVEMENTS[this.movIndex]!;
        }
      }
    }
  }

  private scheduleStep(rawTime: number): void {
    if (this.muted) return;
    const s = this.state;
    const mov = this.activeMov;
    const barIdx = this.barInMov;
    const step = this.stepInBar;
    const bar = mov.bars[barIdx]!;
    const stepDur = 60 / this.effectiveBpm() / 4;
    const t = rawTime + (step % 2 === 1 ? mov.swing : 0);

    // Combined dynamic intensity fusing wave progression, swarm pressure, kill velocity & Resonance Surge!
    const pace = s.isTitle
      ? 0.08
      : Math.min(1.0, s.energy * 0.45 + s.enemyDensity * 0.25 + s.killRate * 0.20 + s.surgeTier * 0.14 + (s.bossActive ? 0.28 : 0));
    const bossEnraged = s.bossActive && s.bossHpPct < 0.50;

    // 1. Lush Stereo Unison Pad Chord on Beat 1 of every bar (+ re-articulation on half-bar during Surge/Boss).
    if (step === 0) {
      this.playPadChord(bar.voicing, t, stepDur * (mov.stepsPerBar - 0.5), s.isTitle ? 0.14 : 0.10 + pace * 0.05);
    }

    // 2. Title Screen: lush ambient spatial crystal soundscape (pads + velvet harp + distant legato lead).
    if (s.isTitle) {
      if (step % 2 === 0) {
        const arpSlot = mov.arpOrder[step % mov.arpOrder.length]!;
        if (arpSlot >= 0) {
          const midi = bar.voicing[arpSlot % bar.voicing.length]! + (arpSlot >= 5 ? 12 : 0);
          this.playArpNote(mtof(midi), t, stepDur * 2.4, 0.042, Math.sin(step * 0.6) * 0.65, false);
        }
      }
      if (barIdx % 2 === 0 && (step === 0 || step === 6 || step === 10)) {
        const note = bar.voicing[(step / 2 + barIdx) % bar.voicing.length]! + 12;
        this.playLeadNote(mtof(note), t, stepDur * 5.2, 0.038, 0.22, false);
      }
      return;
    }

    // 3. Celestial Formant Choir Pad during Obelisk Capture, Surge IV Hyper-Prism, or Enraged Bosses!
    if (step === 0 && (s.obeliskProgress > 0.02 || s.surgeTier >= 4 || bossEnraged)) {
      const choirVol = s.obeliskProgress > 0.02
        ? 0.05 + s.obeliskProgress * 0.09
        : s.surgeTier >= 4
          ? 0.075
          : 0.065;
      this.playChoirChord(bar.voicing.slice(1, 5), t, stepDur * (mov.stepsPerBar - 0.4), choirVol);
    }

    // 4. Driven Analog Reese / Acid Bassline with Real Glide & Bar-Variation!
    const useBassB = bar.turnaround || (barIdx % 2 === 1 && (pace > 0.42 || s.surgeTier >= 2));
    const bassPat = useBassB ? mov.bassB : mov.bassA;
    const bassOff = bassPat[step % bassPat.length]!;
    if (bassOff >= 0) {
      const midi = bar.bass + bassOff;
      const hz = mtof(midi);
      const accent = step === 0 || step === 8 || bassOff === 12 || bassOff >= 14;
      const drive = 950 + pace * 1500 + s.surgeTier * 480 + (bossEnraged ? 700 : 0);
      this.playBass(
        hz,
        t,
        stepDur * (accent ? 1.55 : 0.92),
        0.16 + pace * 0.06 + (s.surgeTier >= 2 ? 0.02 : 0),
        accent ? drive : drive * 0.56,
        step > 0 && bassOff >= 7,
      );
      this.prevBassHz = hz;
    }

    // 5. Polyrhythmic Crystalline Pluck / Baroque Harpsichord Counterpoint Arp!
    const arpSlot = mov.arpOrder[step % mov.arpOrder.length]!;
    const arpActive =
      mov.drumStyle === 'baroque'
      || mov.drumStyle.startsWith('boss_')
      || pace > 0.14
      || s.surgeTier >= 1
      || step % 2 === 0;
    if (arpSlot >= 0 && arpActive) {
      const octUp = (arpSlot >= 5 || (s.surgeTier >= 3 && step % 3 === 0) || (this.phraseVar === 2 && step % 4 === 3)) ? 12 : 0;
      const midi = bar.voicing[arpSlot % bar.voicing.length]! + octUp;
      const pan = Math.sin((step + barIdx * 3) * 0.72) * 0.68;
      const bright = mov.drumStyle === 'baroque' || s.surgeTier >= 2;
      const vol = (mov.drumStyle === 'baroque' ? 0.075 : 0.044 + pace * 0.032) * (step % 3 === 0 ? 1.18 : 0.86);
      this.playArpNote(mtof(midi), t, stepDur * 1.35, vol, pan, bright);
    }

    // 6. 4-Section Evolving Singing Legato Lead + Independent Counter-Melody!
    const pairIdx = Math.floor(barIdx / 2) % 4; // 0..3 -> melodyA / B / C / D across full 8 bars!
    const phraseStep = (barIdx % 2) * mov.stepsPerBar + step;
    const phraseArr = pairIdx === 0 ? mov.melodyA : pairIdx === 1 ? mov.melodyB : pairIdx === 2 ? mov.melodyC : mov.melodyD;
    const rawDeg = phraseArr[phraseStep];
    const leadEnabled = pace > 0.16 || s.surgeTier >= 1 || s.bossActive || barIdx >= 2;

    if (leadEnabled && rawDeg !== null && rawDeg !== undefined) {
      const octLift = (this.phraseVar === 3 || s.surgeTier >= 4) ? 12 : 0;
      const rawMidi = mov.tonicMidi + rawDeg + octLift;
      const snappedMidi = this.snapToScale(rawMidi, bar.scale);
      const hz = mtof(snappedMidi);
      const isStrong = step === 0 || step === 4 || step === 8 || step === 12;
      const dur = stepDur * (isStrong ? 3.2 : 1.9);
      const leadVol = 0.058 + pace * 0.038 + s.surgeTier * 0.008;
      const pan = pairIdx % 2 === 0 ? -0.24 : 0.24;
      this.playLeadNote(hz, t, dur, leadVol, pan, s.surgeTier >= 2 || bossEnraged);
      this.prevLeadHz = hz;

      // Twin Harmony / Octave Doubling during Resonance Surge II+ or High-Pace Climaxes!
      if ((s.surgeTier >= 2 || pace > 0.58 || bossEnraged) && (isStrong || step % 4 === 2)) {
        const harmInterval = s.surgeTier >= 3 ? -5 : -4; // 4th/3rd harmony
        const harmMidi = this.snapToScale(snappedMidi + harmInterval, bar.scale);
        this.playLeadNote(mtof(harmMidi), t, dur * 0.88, leadVol * 0.44, -pan, false);
      }
    } else if (pace > 0.26 || s.surgeTier >= 1) {
      // Independent Mid-Register Counter-Melody weaves into melodic rests (real 2-part counterpoint!)
      const cDeg = mov.counter[step % mov.counter.length];
      if (cDeg !== null && cDeg !== undefined) {
        const cMidi = this.snapToScale(mov.tonicMidi - 12 + cDeg, bar.scale);
        this.playCounterNote(mtof(cMidi), t, stepDur * 2.1, 0.045 + pace * 0.025, step % 2 === 0 ? 0.38 : -0.38);
      }
    }

    // 7. Resonance Surge Power-Chord Drive (Ignites unmistakably when engaging Aim Trainer!)
    if (s.surgeTier >= 2 && !s.deadeyeActive) {
      const hitChord = s.surgeTier >= 3
        ? (step === 0 || step === 3 || step === 6 || step === 8 || step === 11 || step === 14)
        : (step === 0 || step === 6 || step === 10);
      if (hitChord) {
        const root = bar.bass + 24;
        const powerMidis = [root, root + 7, root + 12];
        this.playPowerChord(powerMidis, t, stepDur * 1.4, 0.042 + s.surgeTier * 0.012);
      }
    }

    // 8. Syncopated Brassy Chord Stabs on accent bars!
    if (bar.stab && (step === 6 || step === mov.stepsPerBar - 2) && (pace > 0.32 || s.bossActive)) {
      this.playStab(bar.voicing.slice(0, 4), t, stepDur * 1.35, 0.068 + pace * 0.036);
    }

    // 9. Hostile Pink Ghost Sniper Tension Ostinato (audible radar-pizzicato warning locked in key!)
    if (s.ghostActive && !s.deadeyeActive) {
      const ghostFire = s.ghostImminent ? true : step % 2 === 1;
      if (ghostFire) {
        const tensionMidi = this.snapToScale(mov.tonicMidi + (s.ghostImminent ? 13 : 7), bar.scale);
        this.playGhostPulse(mtof(tensionMidi), t, stepDur * 0.55, s.ghostImminent ? 0.068 : 0.042, s.ghostImminent);
      }
    }

    // 10. Low-HP Danger Sub-Heartbeat (Visceral adrenaline warning below 35% Hull!)
    if (s.lowHp > 0.15 && (step === 0 || step === 3)) {
      this.playHeartbeat(t, 0.12 + s.lowHp * 0.14, step === 0 ? 56 : 48);
    }

    // 11. Bar 7 → Bar 0 Reverse-Noise Tension Riser leading into every phrase drop!
    if (barIdx === 7 && step === 8 && pace > 0.30 && !s.deadeyeActive) {
      this.playRiser(t, stepDur * (mov.stepsPerBar - 8), 0.065 + pace * 0.045);
    }

    // 12. Studio Hybrid Electronic + War-Taiko Drum Groove + Dynamic Turnaround Fills!
    this.scheduleDrums(mov.drumStyle, mov.stepsPerBar, barIdx, step, t, stepDur, pace, s.surgeTier, bossEnraged);
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

  /** Kick-triggered sidechain ducking on Pads, Bass & Arps so the mix breathes and punches! */
  private triggerSidechain(t: number, depth: number): void {
    const g = this.sidechainBus.gain;
    const floor = Math.max(0.28, 1.0 - depth);
    g.cancelScheduledValues(t);
    g.setValueAtTime(1.0, t);
    g.linearRampToValueAtTime(floor, t + 0.008);
    g.exponentialRampToValueAtTime(1.0, t + 0.125);
  }

  private scheduleDrums(
    style: Movement['drumStyle'],
    stepsPerBar: number,
    barIdx: number,
    step: number,
    t: number,
    stepDur: number,
    pace: number,
    surgeTier: number,
    bossEnraged: boolean,
  ): void {
    const isFillBar = barIdx === 3 || barIdx === 7;
    const fillStart = stepsPerBar - 4;

    // Bar 4 & Bar 8 expressive multi-drum fills (snare rolls + descending toms/taikos)!
    if (isFillBar && step >= fillStart && (pace > 0.24 || style.startsWith('boss_'))) {
      const f = step - fillStart;
      if (barIdx === 7 && (surgeTier >= 2 || bossEnraged)) {
        // High-octane 16th snare/tom rush into the drop!
        this.playSnare(t, 0.10 + f * 0.025);
        this.playTaiko(t, 160 - f * 22, 0.14 + f * 0.02);
      } else {
        if (f === 0) this.playSnare(t, 0.14 + pace * 0.05);
        if (f === 1) this.playTom(t, 220, 0.12);
        if (f === 2) this.playTom(t, 165, 0.13);
        if (f === 3) {
          this.playTom(t, 118, 0.15);
          this.playSnare(t, 0.12);
        }
      }
      return;
    }

    const kick = (vol: number): void => {
      this.playKick(t, vol);
      this.triggerSidechain(t, 0.44 + Math.min(0.22, pace * 0.16 + surgeTier * 0.03));
    };

    if (style === 'boss_78') {
      // 7/8 Progressive Clockwork Groove (14 steps grouped 3 + 3 + 2 + 3 + 3!)
      if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11) {
        kick(step === 0 || step === 8 ? 0.30 : 0.22);
      }
      if (step === 6 || step === 12) this.playSnare(t, 0.18);
      if (step === 2 || step === 9) this.playSnare(t, 0.065);
      this.playHat(t, step === 3 || step === 10, step % 2 === 0 ? 0.052 : 0.028);
      if (bossEnraged && (step === 0 || step === 6 || step === 11)) this.playTaiko(t, 82, 0.19);
    } else if (style === 'boss_iron' || style === 'boss_apoc') {
      // Relentless Double-Kick War-Groove + Orchestral Taiko Thunder!
      const isApoc = style === 'boss_apoc' || bossEnraged;
      if (step === 0 || step === 2 || step === 6 || step === 8 || step === 10 || step === 14 || (isApoc && step === 12)) {
        kick(step % 4 === 0 ? 0.31 : 0.21);
      }
      if (step === 4 || step === 12) this.playSnare(t, 0.19);
      if (step === 7 || step === 15) this.playSnare(t, 0.085);
      if (step === 0 || step === 8) this.playTaiko(t, 72, 0.22);
      this.playHat(t, step === 2 || step === 10, step % 2 === 0 ? 0.056 : 0.032);
    } else if (style === 'liquid') {
      // Energetic Liquid Drum & Bass Two-Step Breakbeat!
      if (step === 0 || step === 10 || (surgeTier >= 2 && step === 6)) kick(0.27 + pace * 0.07);
      if (step === 4 || step === 12) this.playSnare(t, 0.16 + pace * 0.05);
      if (step === 7 || step === 9 || step === 15) this.playSnare(t, 0.06); // classic breakbeat ghost notes!
      this.playHat(t, step === 2 || step === 14, step % 2 === 0 ? 0.05 : 0.026);
    } else if (style === 'baroque') {
      // Syncopated Electro-Breakbeat interlocking with 16th Bach counterpoint!
      if (step === 0 || step === 6 || step === 10 || (surgeTier >= 3 && step === 14)) kick(0.26 + pace * 0.07);
      if (step === 4 || step === 12) this.playSnare(t, 0.15 + pace * 0.05);
      if (step === 15) this.playSnare(t, 0.07);
      if (step % 2 === 0 || pace > 0.30 || surgeTier >= 1) {
        this.playHat(t, step === 2 || step === 14, step % 4 === 0 ? 0.05 : 0.026);
      }
    } else if (style === 'cinematic') {
      // Colossal Half-Time Drop Groove (accelerates into full-time during Surge III+!)
      if (surgeTier >= 3) {
        if (step % 4 === 0 || step === 10) kick(0.28);
        if (step === 4 || step === 12) this.playSnare(t, 0.17);
      } else {
        if (step === 0 || step === 10 || (step === 14 && pace > 0.38)) kick(0.29 + pace * 0.06);
        if (step === 8) this.playSnare(t, 0.19 + pace * 0.05);
        if (step === 0) this.playTaiko(t, 64, 0.16);
      }
      if (step % 2 === 0 || surgeTier >= 1) this.playHat(t, step === 12, 0.042);
    } else if (style === 'anthem') {
      // Driving Cyber-Symphonic 4-on-the-Floor Anthem!
      if (step % 4 === 0 || (surgeTier >= 3 && step === 14)) kick(0.29 + pace * 0.07);
      if (step === 4 || step === 12) this.playSnare(t, 0.16 + pace * 0.06);
      if (step === 7 || step === 15) this.playSnare(t, 0.06);
      this.playHat(t, step % 4 === 2, step % 2 === 0 ? 0.052 : 0.03);
    } else {
      // Progressive Synth-Rock ('prog') — starts taut and opens progressively with wave & Surge!
      if (step === 0 || step === 8 || (pace > 0.25 && step === 10) || (surgeTier >= 2 && step === 4)) {
        kick(0.24 + pace * 0.08);
      }
      if ((step === 4 || step === 12) && (pace > 0.14 || surgeTier >= 1)) {
        this.playSnare(t, 0.11 + pace * 0.06);
      }
      if (pace > 0.45 && (step === 7 || step === 15)) this.playSnare(t, 0.048);
      if (step % 2 === 0 || pace > 0.36 || surgeTier >= 1) {
        this.playHat(t, step % 4 === 2, step % 2 === 0 ? 0.045 : 0.024);
      }
    }

    // Driving Ride Cymbal Bell shimmer during Surge III-IV or Enraged Bosses!
    if ((surgeTier >= 3 || bossEnraged) && step % 2 === 0) {
      this.playRide(t, step % 4 === 0 ? 0.038 : 0.022);
    }

    // Wide Stereo Crash Cymbal on Phrase Downbeats!
    if ((barIdx === 0 || (barIdx === 4 && (surgeTier >= 2 || bossEnraged))) && step === 0 && pace > 0.18) {
      this.playCrash(t, stepDur * 8, 0.068 + pace * 0.03);
    }
  }

  // ── Studio Instrument Synthesizers ────────────────────────────────────────

  /** Detuned Analog Reese + Sub Bass with real pitch portamento glide! */
  private playBass(
    freq: number,
    t: number,
    dur: number,
    vol: number,
    cutoffPeak: number,
    glide: boolean,
  ): void {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const subGain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    sub.type = 'sine';

    if (glide && this.prevBassHz > 20 && Math.abs(this.prevBassHz - freq) > 1) {
      osc1.frequency.setValueAtTime(this.prevBassHz, t);
      osc1.frequency.exponentialRampToValueAtTime(freq, t + 0.036);
      osc2.frequency.setValueAtTime(this.prevBassHz * 1.0055, t);
      osc2.frequency.exponentialRampToValueAtTime(freq * 1.0055, t + 0.036);
      sub.frequency.setValueAtTime(this.prevBassHz * 0.5, t);
      sub.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.036);
    } else {
      osc1.frequency.setValueAtTime(freq, t);
      osc2.frequency.setValueAtTime(freq * 1.0055, t);
      sub.frequency.setValueAtTime(freq * 0.5, t);
    }

    filt.type = 'lowpass';
    filt.Q.value = 3.4;
    filt.frequency.setValueAtTime(cutoffPeak, t);
    filt.frequency.exponentialRampToValueAtTime(170, t + Math.min(dur, 0.20));

    subGain.gain.value = 0.58;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc1.connect(filt);
    osc2.connect(filt);
    filt.connect(g);
    sub.connect(subGain);
    subGain.connect(g);
    g.connect(this.sidechainBus);

    osc1.start(t);
    osc2.start(t);
    sub.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  /** Warm Stereo Unison Poly-Pad routed through Sidechain Pump + Hall Reverb! */
  private playPadChord(midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 1.0;
    const peak = 1100 + this.state.energy * 1400 + this.state.surgeTier * 600;
    filt.frequency.setValueAtTime(420, t);
    filt.frequency.linearRampToValueAtTime(peak, t + dur * 0.42);
    filt.frequency.linearRampToValueAtTime(580, t + dur);

    const g = ctx.createGain();
    const perNote = vol / midis.length;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(perNote, t + Math.min(0.28, dur * 0.22));
    g.gain.setValueAtTime(perNote * 0.9, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filt.connect(g);
    g.connect(this.sidechainBus);
    g.connect(this.reverbSend);

    for (let i = 0; i < midis.length; i++) {
      const hz = mtof(midis[i]!);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const pan = ctx.createStereoPanner();
      o1.type = 'sawtooth';
      o2.type = 'triangle';
      const detune = i % 2 === 0 ? 1.0042 : 0.9958;
      o1.frequency.setValueAtTime(hz, t);
      o2.frequency.setValueAtTime(hz * detune, t);
      pan.pan.setValueAtTime(((i / Math.max(1, midis.length - 1)) - 0.5) * 1.1, t);

      const gSaw = ctx.createGain();
      gSaw.gain.value = 0.32;
      o1.connect(gSaw);
      gSaw.connect(pan);
      o2.connect(pan);
      pan.connect(filt);

      o1.start(t);
      o2.start(t);
      o1.stop(t + dur + 0.04);
      o2.stop(t + dur + 0.04);
    }
  }

  /** Dual-Formant Celestial Choir Pad for Obelisk Captures, Surge IV & Boss Enrage! */
  private playChoirChord(midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 740;  f1.Q.value = 4.2;
    f2.type = 'bandpass'; f2.frequency.value = 1280; f2.Q.value = 5.0;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol / midis.length, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    f1.connect(g);
    f2.connect(g);
    g.connect(this.sidechainBus);
    g.connect(this.reverbSend);

    for (const m of midis) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(m), t);
      o.connect(f1);
      o.connect(f2);
      o.start(t);
      o.stop(t + dur + 0.04);
    }
  }

  /** Wide Detuned Supersaw Power-Chord Punch (Ignites on Resonance Surge II–IV!). */
  private playPowerChord(midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 1.6;
    filt.frequency.setValueAtTime(4200, t);
    filt.frequency.exponentialRampToValueAtTime(860, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol / midis.length, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filt.connect(g);
    g.connect(this.sidechainBus);
    g.connect(this.reverbSend);

    for (let i = 0; i < midis.length; i++) {
      const hz = mtof(midis[i]!);
      for (const det of [-0.0045, 0.0045]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(hz * (1 + det), t);
        o.connect(filt);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
    }
  }

  /** Hybrid FM Crystalline Pluck / Harpsichord voice for polyrhythmic counterpoint arps. */
  private playArpNote(freq: number, t: number, dur: number, vol: number, pan: number, bright: boolean): void {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();

    car.type = bright ? 'triangle' : 'sine';
    car.frequency.setValueAtTime(freq, t);
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * (bright ? 3.0 : 2.0), t);

    modGain.gain.setValueAtTime(freq * (bright ? 1.85 : 1.2), t);
    modGain.gain.exponentialRampToValueAtTime(1.0, t + Math.min(dur * 0.5, 0.11));

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), t);

    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(g);
    g.connect(panner);
    panner.connect(this.sidechainBus);
    panner.connect(this.delaySend);
    panner.connect(this.reverbSend);

    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.02);
    mod.stop(t + dur + 0.02);
  }

  /** Expressive Singing Legato Lead with Portamento Glide, Delayed Vibrato & Surge Grit! */
  private playLeadNote(
    freq: number,
    t: number,
    dur: number,
    vol: number,
    pan: number,
    supercharged: boolean,
  ): void {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();

    o1.type = 'sawtooth';
    o2.type = supercharged ? 'sawtooth' : 'triangle';

    // Smooth expressive pitch portamento glide from previous melody note when interval <= an octave!
    const doGlide = this.prevLeadHz > 40 && Math.abs(Math.log2(freq / this.prevLeadHz)) < 1.1;
    if (doGlide) {
      o1.frequency.setValueAtTime(this.prevLeadHz, t);
      o1.frequency.exponentialRampToValueAtTime(freq, t + 0.032);
      o2.frequency.setValueAtTime(this.prevLeadHz * 1.005, t);
      o2.frequency.exponentialRampToValueAtTime(freq * 1.005, t + 0.032);
    } else {
      o1.frequency.setValueAtTime(freq, t);
      o2.frequency.setValueAtTime(freq * 1.005, t);
    }

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.6, t);
    lfoGain.gain.setValueAtTime(0.0, t);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.011, t + Math.min(dur * 0.45, 0.22));
    lfo.connect(lfoGain);
    lfoGain.connect(o1.frequency);
    lfoGain.connect(o2.frequency);

    filt.type = 'lowpass';
    filt.Q.value = supercharged ? 3.0 : 2.1;
    filt.frequency.setValueAtTime(freq * 1.8, t);
    filt.frequency.linearRampToValueAtTime(Math.min(8600, freq * (supercharged ? 6.2 : 4.5)), t + 0.055);
    filt.frequency.exponentialRampToValueAtTime(Math.max(460, freq * 2.0), t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.014);
    g.gain.setValueAtTime(vol * 0.86, t + dur * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    panner.pan.setValueAtTime(pan, t);

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    g.connect(panner);
    panner.connect(this.leadBus);
    panner.connect(this.delaySend);
    panner.connect(this.reverbSend);

    o1.start(t);
    o2.start(t);
    lfo.start(t);
    o1.stop(t + dur + 0.03);
    o2.stop(t + dur + 0.03);
    lfo.stop(t + dur + 0.03);
  }

  /** Warm FM Rhodes / Plucked Guitar Mid-Register Counter-Melody Voice. */
  private playCounterNote(freq: number, t: number, dur: number, vol: number, pan: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();

    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq * 2.2, t);
    filt.Q.value = 1.2;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    panner.pan.setValueAtTime(pan, t);
    o.connect(filt);
    filt.connect(g);
    g.connect(panner);
    panner.connect(this.leadBus);
    panner.connect(this.reverbSend);

    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Staccato Sonar-Pizzicato Tension Pulse while a Pink Ghost Sniper locks onto you! */
  private playGhostPulse(freq: number, t: number, dur: number, vol: number, urgent: boolean): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = urgent ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(freq, t);
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(urgent ? 2600 : 1850, t);
    filt.Q.value = 3.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filt);
    filt.connect(g);
    g.connect(this.leadBus);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private playStab(midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 2.4;
    filt.frequency.setValueAtTime(4200, t);
    filt.frequency.exponentialRampToValueAtTime(560, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol / midis.length, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filt.connect(g);
    g.connect(this.leadBus);
    g.connect(this.delaySend);
    g.connect(this.reverbSend);

    for (const m of midis) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(m), t);
      o.connect(filt);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  // ── Studio Electronic + War-Taiko Drum Synthesis ──────────────────────────

  /** Layered Punchy Kick: crisp click transient + tight sub boom. */
  private playKick(t: number, vol: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const click = ctx.createOscillator();
    const g = ctx.createGain();
    const cg = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(162, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.072);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);

    click.type = 'triangle';
    click.frequency.setValueAtTime(1850, t);
    click.frequency.exponentialRampToValueAtTime(190, t + 0.012);
    cg.gain.setValueAtTime(vol * 0.42, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);

    osc.connect(g);
    click.connect(cg);
    g.connect(this.drumBus);
    cg.connect(this.drumBus);

    osc.start(t);
    click.start(t);
    osc.stop(t + 0.23);
    click.stop(t + 0.02);
  }

  /** Layered Snappy Snare + Stereo Room Clap! */
  private playSnare(t: number, vol: number): void {
    const ctx = this.ctx;
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(215, t);
    body.frequency.exponentialRampToValueAtTime(112, t + 0.085);
    bg.gain.setValueAtTime(vol * 0.65, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    body.connect(bg);
    bg.connect(this.drumBus);
    body.start(t);
    body.stop(t + 0.12);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2100, t);
    hp.Q.value = 0.75;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.92, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.drumBus);
    ng.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.18);
  }

  private playHat(t: number, open: boolean, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(open ? 6400 : 8600, t);
    const dur = open ? 0.16 : 0.042;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.drumBus);
    src.start(t);
    src.stop(t + dur + 0.015);
  }

  private playRide(t: number, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(5400, t);
    bp.Q.value = 2.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.26);
  }

  private playTom(t: number, startHz: number, vol: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, t);
    osc.frequency.exponentialRampToValueAtTime(startHz * 0.48, t + 0.14);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.drumBus);
    g.connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** Deep Orchestral War-Taiko / Timpani Hit for Bosses & Cinematic Drops! */
  private playTaiko(t: number, hz: number, vol: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz * 1.45, t);
    osc.frequency.exponentialRampToValueAtTime(hz, t + 0.09);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(g);
    g.connect(this.drumBus);
    g.connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private playHeartbeat(t: number, vol: number, hz: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz * 1.35, t);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.72, t + 0.11);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g);
    g.connect(this.drumBus);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  /** Tempo-locked reverse-cymbal / filtered noise swell leading into drops! */
  private playRiser(t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(380, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.94);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private playCrash(t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(4200, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.drumBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + dur + 0.04);
  }
}
