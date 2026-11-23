// Bootstrap for Prism — wires WASM ↔ WebGL2 Spectral Renderer ↔ 2D Tactical/Aim Overlay
// ↔ Input (KB/Mouse/Touch/Twin-Stick Gamepad) ↔ Multi-Section Adaptive Music & Harmonic SFX.

import init, { Game } from '../wasm/prism.js';
import { Renderer, VisualQuality } from './renderer.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { OverlayRenderer } from './overlay.js';
import { getEvolutionSvg, getShardSvg } from './shardIcons.js';

const CIRCLE_STRIDE_FLOATS = 9;
const BEAM_STRIDE_FLOATS = 10;       // layout from WASM (read only)
const BEAM_AUGMENTED_STRIDE = 11;    // +1 form_progress float injected before upload
const POPUP_STRIDE_FLOATS = 4;
const AIM_TARGET_STRIDE_FLOATS = 8;

const AUDIO_BOSS_SPAWN = 1 << 2;
const AUDIO_SHIELD_BREAK = 1 << 4;
const AUDIO_STREAK_MILESTONE = 1 << 7;
const AUDIO_EVOLUTION = 1 << 8;
const AUDIO_AIM_HIT = 1 << 9;
const AUDIO_AIM_COMPLETE = 1 << 10;
const AUDIO_AIM_MISS = 1 << 11;

// Must stay in index-lock with Rust's SYNERGIES const (src/shards.rs).
const SYNERGY_NAMES: string[] = [
  'CHAIN REACTION', 'BLIZZARD', 'SUPERNOVA', 'PRISM CANNON', 'TRACKING ECHO',
  'FROZEN ORBIT', 'EVENT HORIZON', 'BLOOD PACT', 'MARTYRDOM', 'RESONANCE', 'GRAVITY WELL',
  'STATIC FREEZE', 'STORM FRONT', 'GRAVITY MINES', 'SEISMIC FIELD', 'TRIPWIRE GRID', 'PHASE WAKE',
  'RAIL FOCUS', 'SURGICAL DRAIN',
];

// Index-locked synergy partner map [shardA, shardB, synergyName] matching src/shards.rs::SYNERGIES.
const SYNERGY_PAIRS: [number, number, string][] = [
  [0, 8, 'CHAIN REACTION'], [0, 11, 'BLIZZARD'], [2, 5, 'SUPERNOVA'], [3, 4, 'PRISM CANNON'],
  [1, 6, 'TRACKING ECHO'], [7, 11, 'FROZEN ORBIT'], [7, 15, 'EVENT HORIZON'], [10, 13, 'BLOOD PACT'],
  [13, 8, 'MARTYRDOM'], [12, 9, 'RESONANCE'], [14, 9, 'GRAVITY WELL'], [20, 11, 'STATIC FREEZE'],
  [20, 8, 'STORM FRONT'], [21, 14, 'GRAVITY MINES'], [21, 9, 'SEISMIC FIELD'], [21, 20, 'TRIPWIRE GRID'],
  [21, 19, 'PHASE WAKE'], [22, 4, 'RAIL FOCUS'], [22, 10, 'SURGICAL DRAIN'],
];

const BOSS_NAMES: string[] = ['PRISM SENTINEL', 'HYDRA', 'VOID PRISM — FINAL BOSS'];
const DAMAGE_SOURCE_NAMES: string[] = ['ENEMY CONTACT', 'PROJECTILE', 'BOSS CONTACT', 'VOID SHOCKWAVE'];
const RANK_TIMELINE_BUCKETS = 16;

// Must stay in index-lock with Rust's ShardKind enum (src/shards.rs).
type Rarity = 'common' | 'rare' | 'legendary' | 'evolution';
interface ShardMeta { name: string; color: string; desc: string; synergies: string[]; rarity: Rarity }
interface EvolutionMeta { name: string; color: string; desc: string; recipe: string }
const SHARDS: ShardMeta[] = [
  { name: 'SPLIT',        color: '#8effa3', rarity: 'common',    desc: 'Fan out more beams per volley',          synergies: ['CASCADE → CHAIN REACTION', 'FROST → BLIZZARD'] },
  { name: 'REFRACT',      color: '#7fd3ff', rarity: 'rare',      desc: 'Beams curve toward nearest enemy',       synergies: ['ECHO → TRACKING ECHO'] },
  { name: 'MIRROR',       color: '#c9a3ff', rarity: 'common',    desc: 'Fire symmetrically in every direction',  synergies: ['DIFFRACT → SUPERNOVA'] },
  { name: 'CHROMATIC',    color: '#ffa3c9', rarity: 'common',    desc: 'Split into red / green / blue sub-rays', synergies: ['LENS → PRISM CANNON'] },
  { name: 'LENS',         color: '#ffe58e', rarity: 'common',    desc: 'Focus thicker, heavier optical beams',   synergies: ['CHROMATIC → PRISM CANNON'] },
  { name: 'DIFFRACT',     color: '#8efff4', rarity: 'rare',      desc: 'Impacts scatter into radial starbursts', synergies: ['MIRROR → SUPERNOVA'] },
  { name: 'ECHO',         color: '#ff9d6c', rarity: 'rare',      desc: 'Delayed reverberating second salvo',     synergies: ['REFRACT → TRACKING ECHO'] },
  { name: 'HALO',         color: '#f5f5bc', rarity: 'rare',      desc: 'Orbital crystal beads slice on contact', synergies: ['FROST → FROZEN ORBIT', 'MOMENTUM → EVENT HORIZON'] },
  { name: 'CASCADE',      color: '#ff6f91', rarity: 'legendary', desc: 'Kills fork into chain-reaction rays',    synergies: ['SPLIT → CHAIN REACTION', 'THORNS → MARTYRDOM'] },
  { name: 'INTERFERENCE', color: '#9a9dff', rarity: 'legendary', desc: 'Standing-wave rings ripple outward',     synergies: ['BARRIER → RESONANCE', 'MAGNET → GRAVITY WELL', 'MINEFIELD → SEISMIC FIELD'] },
  { name: 'SIPHON',       color: '#a3ffdb', rarity: 'common',    desc: 'Beams siphon hull health on hit',        synergies: ['THORNS → BLOOD PACT'] },
  { name: 'FROST',        color: '#b3e5fc', rarity: 'common',    desc: 'Cryo-chill enemies slowed by beams',     synergies: ['HALO → FROZEN ORBIT', 'SPLIT → BLIZZARD'] },
  { name: 'BARRIER',      color: '#64b5f6', rarity: 'common',    desc: 'Regenerating shield absorbs + burns',    synergies: ['INTERFERENCE → RESONANCE'] },
  { name: 'THORNS',       color: '#ef5350', rarity: 'rare',      desc: 'Hull damage triggers retaliatory rays',  synergies: ['SIPHON → BLOOD PACT', 'CASCADE → MARTYRDOM'] },
  { name: 'MAGNET',       color: '#7cffd4', rarity: 'common',    desc: 'Vacuum radiance crystals from afar',     synergies: ['INTERFERENCE → GRAVITY WELL', 'MINEFIELD → GRAVITY MINES'] },
  { name: 'MOMENTUM',     color: '#d7ff6f', rarity: 'common',    desc: 'Faster glide & quicker phase dash',      synergies: ['HALO → EVENT HORIZON'] },
  { name: 'ARMOR',        color: '#9ab8d0', rarity: 'common',    desc: 'Reduce all incoming damage 8% / level',  synergies: [] },
  { name: 'LUCK',         color: '#ffd740', rarity: 'rare',      desc: 'Boost rare & legendary shard rolls',     synergies: [] },
  { name: 'PRISM HEART',  color: '#ff7eb3', rarity: 'common',    desc: '+15 max hull & stronger rank-up heal',   synergies: [] },
  { name: 'PHASE STEP',   color: '#5fffff', rarity: 'rare',      desc: 'Longer dash i-frames; L3 afterimage',    synergies: ['MINEFIELD → PHASE WAKE'] },
  { name: 'ARC',          color: '#b58cff', rarity: 'rare',      desc: 'Chain lightning arcs across crowds',     synergies: ['FROST → STATIC FREEZE', 'CASCADE → STORM FRONT', 'MINEFIELD → TRIPWIRE GRID'] },
  { name: 'MINEFIELD',    color: '#7dff98', rarity: 'legendary', desc: 'Seed faceted charges that pull & burst', synergies: ['MAGNET → GRAVITY MINES', 'INTERFERENCE → SEISMIC FIELD', 'ARC → TRIPWIRE GRID', 'PHASE STEP → PHASE WAKE'] },
  { name: 'LANCE',        color: '#fff06a', rarity: 'rare',      desc: 'Periodic heavy piercing rail shot',      synergies: ['LENS → RAIL FOCUS', 'SIPHON → SURGICAL DRAIN'] },
];

// Must stay in index-lock with Rust's EvolutionKind enum (src/shards.rs).
const EVOLUTIONS: EvolutionMeta[] = [
  { name: 'AFTERIMAGE ENGINE', color: '#ffb547', desc: 'Dashing leaves firing echoes at your old position', recipe: 'ECHO 6 + MOMENTUM 6' },
  { name: 'WHITEOUT',          color: '#b9f4ff', desc: 'Frozen kills erupt into freezing rays & deep frost fields', recipe: 'FROST 6 + DIFFRACT 6' },
  { name: 'KALEIDOSCOPE',      color: '#cc88ff', desc: 'Every salvo unleashes a 12-ray great-circle prism ring', recipe: 'SPLIT 6 + MIRROR 6' },
  { name: 'SINGULARITY',       color: '#7a6bff', desc: 'Interference rings become spiraling gravity wells (+75% DMG)', recipe: 'MAGNET 6 + INTERFERENCE 6' },
  { name: 'SOLAR CROWN',       color: '#ffec66', desc: 'Halo hits recharge barrier; barrier blocks flare all orbitals', recipe: 'HALO 6 + BARRIER 6' },
];

type RunOutcome = 'VICTORY' | 'DEATH';
interface StoredShard { name: string; level: number }
interface StoredRunSummary {
  version: 1;
  savedAt: string;
  outcome: RunOutcome;
  seed?: number;
  daily?: boolean;
  deathCause?: string;
  score: number;
  timeSeconds: number;
  rank: number;
  peakRank: number;
  kills: number;
  peakStreak?: number;
  bossKills: number;
  damageTaken: number;
  barrierAbsorbed: number;
  gems: number;
  skips?: number;
  rerolls?: number;
  aimTier?: number;
  aimDrills?: number;
  maxObserved?: { enemies: number; circles: number; beams: number };
  synergies: string[];
  evolutions?: string[];
  topShards: StoredShard[];
}

const BEST_RUNS_STORAGE_KEY = 'prism.bestRuns.v1';
const QUALITY_STORAGE_KEY = 'prism.visualQuality.v1';
const NUMBERS_STORAGE_KEY = 'prism.damageNumbers.v1';
const MAX_STORED_RUNS = 5;

const formatTime = (secondsRaw: number): string => {
  const s = Math.max(0, Math.floor(secondsRaw));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

const formatCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });

const getDailySeedInfo = (): { dateLabel: string; seed: number } => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const dateLabel = `${y}-${m}-${d}`;
  const key = `PRISM-DAILY-${dateLabel}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return { dateLabel, seed: (h || 1) >>> 0 };
};

const isStoredShard = (v: unknown): v is StoredShard => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<StoredShard>;
  return typeof s.name === 'string' && typeof s.level === 'number';
};

const isStoredRunSummary = (v: unknown): v is StoredRunSummary => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<StoredRunSummary>;
  return r.version === 1 &&
    (r.outcome === 'VICTORY' || r.outcome === 'DEATH') &&
    typeof r.savedAt === 'string' &&
    typeof r.score === 'number' &&
    typeof r.timeSeconds === 'number' &&
    typeof r.rank === 'number' &&
    typeof r.peakRank === 'number' &&
    typeof r.kills === 'number' &&
    typeof r.bossKills === 'number' &&
    typeof r.damageTaken === 'number' &&
    typeof r.barrierAbsorbed === 'number' &&
    typeof r.gems === 'number' &&
    Array.isArray(r.synergies) &&
    r.synergies.every((s) => typeof s === 'string') &&
    Array.isArray(r.topShards) &&
    r.topShards.every(isStoredShard);
};

const compareRuns = (a: StoredRunSummary, b: StoredRunSummary): number => {
  if (a.score !== b.score) return b.score - a.score;
  if (a.outcome !== b.outcome) return a.outcome === 'VICTORY' ? -1 : 1;
  if (a.timeSeconds !== b.timeSeconds) return b.timeSeconds - a.timeSeconds;
  if (a.peakRank !== b.peakRank) return b.peakRank - a.peakRank;
  return b.kills - a.kills;
};

const readStoredRuns = (): StoredRunSummary[] => {
  try {
    const raw = window.localStorage.getItem(BEST_RUNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRunSummary).sort(compareRuns).slice(0, MAX_STORED_RUNS);
  } catch {
    return [];
  }
};

const saveRunSummary = (summary: StoredRunSummary): {
  runs: StoredRunSummary[];
  isNewBest: boolean;
  storageOk: boolean;
} => {
  const prev = readStoredRuns();
  const prevBest = prev[0];
  const isNewBest = !prevBest || compareRuns(summary, prevBest) < 0;
  const runs = [...prev, summary].sort(compareRuns).slice(0, MAX_STORED_RUNS);
  let storageOk = true;
  try {
    window.localStorage.setItem(BEST_RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch {
    storageOk = false;
  }
  return { runs, isNewBest, storageOk };
};

const buildRankSparklineSvg = (game: Game, minutesActive: number): string => {
  const count = Math.max(2, Math.min(RANK_TIMELINE_BUCKETS, Math.ceil(minutesActive) + 1));
  const vals: number[] = [];
  for (let i = 0; i < count; i++) vals.push(game.rank_at_minute(i));
  const maxVal = Math.max(1, ...vals);
  const w = 320;
  const h = 58;
  const pts = vals.map((v, i) => {
    const x = (i / (count - 1)) * (w - 8) + 4;
    const y = h - 6 - (v / maxVal) * (h - 14);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `4,${h - 4} ${line} ${(w - 4).toFixed(1)},${h - 4}`;
  return (
    `<svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#7df4ff" stop-opacity="0.35"/>` +
    `<stop offset="100%" stop-color="#7df4ff" stop-opacity="0.02"/>` +
    `</linearGradient></defs>` +
    `<polygon points="${area}" fill="url(#sparkFill)"/>` +
    `<polyline points="${line}" fill="none" stroke="#7df4ff" stroke-width="2" stroke-linejoin="round"/>` +
    `</svg>`
  );
};

async function main(): Promise<void> {
  const canvasEl = document.getElementById('canvas');
  const overlayCanvasEl = document.getElementById('overlay-canvas');
  if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('missing #canvas');
  if (!(overlayCanvasEl instanceof HTMLCanvasElement)) throw new Error('missing #overlay-canvas');
  const canvas: HTMLCanvasElement = canvasEl;
  const overlayCanvas: HTMLCanvasElement = overlayCanvasEl;

  const getEl = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id} in index.html`);
    return el;
  };

  const hudEl = getEl('hud');
  const statusEl = getEl('status');
  const rankEl = getEl('rank');
  const killsEl = getEl('kills');
  const xpFillEl = getEl('xp-fill');
  const trayEl = getEl('shards-tray');
  const levelupEl = getEl('levelup');
  const levelupRankEl = getEl('levelup-rank');
  const levelupCardsEl = getEl('levelup-cards');
  const levelupFooterEl = getEl('levelup-footer');
  const timerEl = getEl('timer');
  const waveLabelEl = getEl('wave-label');
  const endlessBadgeEl = getEl('endless-badge');
  const xpRankLabelEl = getEl('xp-rank-label');
  const xpValEl = getEl('xp-val');
  const dashStatusEl = getEl('dash-status');
  const hpValEl = getEl('hp-val');
  const hpFillEl = getEl('hp-fill');
  const dashFillEl = getEl('dash-fill');
  const waveClearEl = getEl('wave-clear');
  const comboWrapEl = getEl('combo-wrap');
  const comboValEl = getEl('combo-val');
  const comboFillEl = getEl('combo-fill');
  const synergiesHudEl = getEl('synergies-hud');
  const bossHudEl = getEl('boss-hud');
  const bossNameEl = getEl('boss-name');
  const bossFillEl = getEl('boss-fill');
  const sysBarMidEl = getEl('sys-bar-mid');
  const sysUplinkEl = getEl('sys-uplink');
  const sysMusicBtn = getEl('sys-music-btn') as HTMLButtonElement;
  const sysMuteBtn = getEl('sys-mute-btn') as HTMLButtonElement;
  const sysPauseBtn = getEl('sys-pause-btn') as HTMLButtonElement;

  const aimHudEl = getEl('aim-hud');
  const aimTierValEl = getEl('aim-tier-val');
  const aimComboValEl = getEl('aim-combo-val');
  const aimDrillValEl = getEl('aim-drill-val');
  const aimAccValEl = getEl('aim-acc-val');

  const titleScreenEl = getEl('title-screen');
  const btnPlay = getEl('btn-play') as HTMLButtonElement;
  const btnDaily = getEl('btn-daily') as HTMLButtonElement;
  const titleBestEl = getEl('title-best');

  const deathScreenEl = getEl('death-screen');
  const deathTitleEl = getEl('death-title');
  const deathScoreEl = getEl('death-score');
  const deathStatsEl = getEl('death-stats');
  const deathRestartEl = getEl('death-restart') as HTMLButtonElement;
  const btnContinueEndless = getEl('btn-continue-endless') as HTMLButtonElement;
  const btnCopyTelemetry = getEl('btn-copy-telemetry') as HTMLButtonElement;

  const pauseMenuEl = getEl('pause-menu');
  const pauseNowPlayingEl = getEl('pause-now-playing');
  const pauseBuildEl = getEl('pause-build');
  const btnResume = getEl('btn-resume') as HTMLButtonElement;
  const btnRestartPause = getEl('btn-restart-pause') as HTMLButtonElement;
  const btnToggleMusic = getEl('btn-toggle-music') as HTMLButtonElement;
  const btnToggleSound = getEl('btn-toggle-sound') as HTMLButtonElement;
  const btnToggleFx = getEl('btn-toggle-fx') as HTMLButtonElement;
  const btnToggleNumbers = getEl('btn-toggle-numbers') as HTMLButtonElement;

  // Boot WASM.
  const wasm = await init();
  const memory: WebAssembly.Memory = wasm.memory;

  // Build synergy tags & shard tray.
  synergiesHudEl.innerHTML = '';
  const synergyTags: HTMLElement[] = [];
  for (const name of SYNERGY_NAMES) {
    const tag = document.createElement('div');
    tag.className = 'synergy-tag';
    tag.textContent = '⚡ ' + name;
    tag.style.display = 'none';
    synergiesHudEl.appendChild(tag);
    synergyTags.push(tag);
  }

  trayEl.innerHTML = '';
  const pips: HTMLElement[] = [];
  for (let i = 0; i < SHARDS.length; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'shard-pip-wrap';
    wrap.style.display = 'none';
    wrap.title = SHARDS[i]!.name;
    const hex = document.createElement('div');
    hex.className = 'shard-pip';
    wrap.appendChild(hex);
    const lvlLabel = document.createElement('div');
    lvlLabel.className = 'shard-pip-label';
    lvlLabel.textContent = 'L0';
    wrap.appendChild(lvlLabel);
    trayEl.appendChild(wrap);
    pips.push(wrap);
  }

  const renderer = new Renderer(canvas);
  const overlay = new OverlayRenderer(overlayCanvas);
  const input = new Input(canvas);
  const audio = new AudioManager();

  // Restore saved preferences.
  let numbersEnabled = true;
  try {
    const savedQ = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (savedQ === 'high' || savedQ === 'balanced' || savedQ === 'reduced') renderer.setQuality(savedQ);
    numbersEnabled = window.localStorage.getItem(NUMBERS_STORAGE_KEY) !== '0';
    overlay.setEnabled(numbersEnabled);
  } catch { /* ignore */ }

  const syncSettingsButtons = (): void => {
    const sfxMuted = audio.isSfxMuted();
    const musicMuted = audio.isMusicMuted();
    btnToggleSound.textContent = sfxMuted ? 'SFX: OFF' : 'SFX: ON';
    sysMuteBtn.textContent = sfxMuted ? 'SFX: OFF' : 'SFX: ON';
    btnToggleMusic.textContent = musicMuted ? 'MUSIC: OFF' : 'MUSIC: ON';
    sysMusicBtn.textContent = musicMuted ? 'MUSIC: OFF' : 'MUSIC: ON';
    btnToggleFx.textContent = `FX: ${renderer.getQuality().toUpperCase()}`;
    btnToggleNumbers.textContent = numbersEnabled ? 'NUMBERS: ON' : 'NUMBERS: OFF';
  };
  syncSettingsButtons();

  const ensureAudio = (): void => {
    if (!audio.isInitialized()) audio.init();
    audio.resume();
  };
  window.addEventListener('keydown', ensureAudio, { once: true });
  window.addEventListener('pointerdown', ensureAudio, { once: true });

  const DPR_CAP = 2;
  let viewW = 0;
  let viewH = 0;
  let pixelW = 0;
  let pixelH = 0;

  const applySize = (): void => {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    pixelW = Math.max(1, Math.floor(viewW * dpr));
    pixelH = Math.max(1, Math.floor(viewH * dpr));
    canvas.width = pixelW;
    canvas.height = pixelH;
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    overlay.resize(viewW, viewH, dpr);
  };
  applySize();

  const daily = getDailySeedInfo();
  btnDaily.textContent = `DAILY · ${daily.dateLabel}`;
  const urlParams = new URLSearchParams(window.location.search);
  const urlSeedRaw = urlParams.get('seed');
  const urlSeed = urlSeedRaw && /^\d+$/.test(urlSeedRaw) ? (Number(urlSeedRaw) >>> 0) : null;
  const autoStart = urlParams.get('autostart') === '1' || urlSeed !== null;

  const updateTitleBestBadge = (): void => {
    const best = readStoredRuns()[0];
    titleBestEl.textContent = best
      ? `★ PERSONAL BEST · ${best.score} PTS · ${formatTime(best.timeSeconds)} · RANK ${best.peakRank} (${best.outcome})`
      : '';
  };
  updateTitleBestBadge();

  let currentSeed = urlSeed ?? ((Math.random() * 0xffffffff) >>> 0);
  let isDailyRun = false;
  let game = new Game(viewW, viewH, currentSeed);
  let isStarted = autoStart;
  let isPaused = false;
  let modalShown = false;
  let deathShown = false;
  let modalFocusIdx = 0;
  let hitStopTimer = 0;
  let lastRunTelemetryText = '';

  const attractCircles = new Float32Array(CIRCLE_STRIDE_FLOATS * 16);
  const attractBeams = new Float32Array(BEAM_AUGMENTED_STRIDE * 6);

  // Zero-copy WASM views.
  let circlesPtr = -1;
  let circlesLen = 0;
  let circlesView: Float32Array = new Float32Array(0);
  let beamsPtr = -1;
  let beamsLen = 0;
  let beamsView: Float32Array = new Float32Array(0);
  let popupsPtr = -1;
  let popupsLen = 0;
  let popupsView: Float32Array = new Float32Array(0);
  let aimTargetsPtr = -1;
  let aimTargetsLen = 0;
  let aimTargetsView: Float32Array = new Float32Array(0);

  interface BeamEntry { birth: number; duration: number }
  const beamBirthTimes = new Map<string, BeamEntry>();
  let augBeamBuf = new Float32Array(0);

  const resetWasmViews = (): void => {
    circlesPtr = -1; circlesLen = 0;
    beamsPtr = -1; beamsLen = 0;
    popupsPtr = -1; popupsLen = 0;
    aimTargetsPtr = -1; aimTargetsLen = 0;
    beamBirthTimes.clear();
  };

  const refreshBuffers = (): void => {
    const cPtr = game.circles_ptr();
    const cLen = game.circles_len();
    if (cPtr !== circlesPtr || cLen !== circlesLen || circlesView.buffer !== memory.buffer) {
      circlesPtr = cPtr; circlesLen = cLen;
      circlesView = cLen > 0 ? new Float32Array(memory.buffer, cPtr, cLen * CIRCLE_STRIDE_FLOATS) : new Float32Array(0);
    }

    const bPtr = game.beams_ptr();
    const bLen = game.beams_len();
    if (bPtr !== beamsPtr || bLen !== beamsLen || beamsView.buffer !== memory.buffer) {
      beamsPtr = bPtr; beamsLen = bLen;
      beamsView = bLen > 0 ? new Float32Array(memory.buffer, bPtr, bLen * BEAM_STRIDE_FLOATS) : new Float32Array(0);
    }

    const pPtr = game.popups_ptr();
    const pLen = game.popups_len();
    if (pPtr !== popupsPtr || pLen !== popupsLen || popupsView.buffer !== memory.buffer) {
      popupsPtr = pPtr; popupsLen = pLen;
      popupsView = pLen > 0 ? new Float32Array(memory.buffer, pPtr, pLen * POPUP_STRIDE_FLOATS) : new Float32Array(0);
    }

    const aPtr = game.aim_targets_ptr();
    const aLen = game.aim_targets_len();
    if (aPtr !== aimTargetsPtr || aLen !== aimTargetsLen || aimTargetsView.buffer !== memory.buffer) {
      aimTargetsPtr = aPtr; aimTargetsLen = aLen;
      aimTargetsView = aLen > 0 ? new Float32Array(memory.buffer, aPtr, aLen * AIM_TARGET_STRIDE_FLOATS) : new Float32Array(0);
    }
  };

  // HUD change-detection cache.
  let lastRank = -1;
  let lastKills = -1;
  let lastScore = -1;
  let lastXpPct = -1;
  let lastXp = -1;
  let lastXpNeeded = -1;
  let lastHp = -1;
  let lastMaxHp = -1;
  let lastHpPct = -1;
  let lastDashReady = false;
  let lastTimerStr = '';
  let lastWave = -1;
  let lastBossActive = false;
  let lastBossKind = -2;
  let lastBossPct = -1;
  let lastStreak = -1;
  let lastEndless = false;
  const lastPipLevels: number[] = new Array(SHARDS.length).fill(-1);
  let lastActiveBits = -1;
  let lastNearBits = -1;
  let announcedSynergyBits = 0;
  let announcedEvoBits = 0;

  const resetHudCache = (): void => {
    lastRank = -1; lastKills = -1; lastScore = -1;
    lastXpPct = -1; lastXp = -1; lastXpNeeded = -1;
    lastHp = -1; lastMaxHp = -1; lastHpPct = -1;
    lastDashReady = false; lastTimerStr = ''; lastWave = -1;
    lastBossActive = false; lastBossKind = -2; lastBossPct = -1;
    lastStreak = -1; lastEndless = false;
    lastPipLevels.fill(-1);
    lastActiveBits = -1; lastNearBits = -1;
    announcedSynergyBits = 0; announcedEvoBits = 0;
  };

  const syncCursorVisibility = (): void => {
    const hide = isStarted && !isPaused && !modalShown && !deathShown && input.isMouseAiming();
    document.body.classList.toggle('aim-cursor-hidden', hide);
  };

  const startNewRun = (seed: number, dailyMode: boolean): void => {
    ensureAudio();
    audio.playUiSelect();
    currentSeed = seed >>> 0;
    isDailyRun = dailyMode;
    game.free();
    game = new Game(viewW, viewH, currentSeed);
    resetWasmViews();
    resetHudCache();
    overlay.clear();
    input.clearKeys();
    isStarted = true;
    isPaused = false;
    modalShown = false;
    deathShown = false;
    hitStopTimer = 0;
    titleScreenEl.classList.remove('shown');
    pauseMenuEl.classList.remove('shown');
    levelupEl.classList.remove('shown');
    deathScreenEl.classList.remove('shown');
    hudEl.classList.remove('hidden');
    aimHudEl.classList.remove('shown');
    audio.duck(false);
    sysBarMidEl.textContent = dailyMode
      ? `DAILY ${daily.dateLabel} · SEED #${currentSeed}`
      : `SPHERICAL ARENA · SEED #${currentSeed}`;
    overlay.announce(
      dailyMode ? `DAILY ${daily.dateLabel}` : 'PRISM ENGAGED',
      '#7df4ff',
      'COLLECT GEMS TO EVOLVE · CLICK & TRACK GOLDEN NODES FOR OVERDRIVE',
    );
    last = performance.now();
  };

  if (autoStart) {
    titleScreenEl.classList.remove('shown');
    hudEl.classList.remove('hidden');
    sysBarMidEl.textContent = `SPHERICAL ARENA · SEED #${currentSeed}`;
  }

  btnPlay.addEventListener('click', () => startNewRun((Math.random() * 0xffffffff) >>> 0, false));
  btnDaily.addEventListener('click', () => startNewRun(daily.seed, true));

  // --- Pause Deck + Build Inspector --------------------------------------

  const renderPauseBuild = (): void => {
    pauseNowPlayingEl.textContent = `♪ ${audio.getNowPlaying()}`;
    const owned = SHARDS.map((s, i) => ({
      name: s.name, color: s.color, lvl: game.inventory_level(i),
    })).filter((s) => s.lvl > 0).sort((a, b) => b.lvl - a.lvl);
    const activeSyn = SYNERGY_NAMES.filter((_, i) => ((game.active_synergy_bits() >>> i) & 1) === 1);
    const activeEvo = EVOLUTIONS.filter((_, i) => ((game.active_evolution_bits() >>> i) & 1) === 1).map((e) => e.name);
    const dps = game.total_damage_dealt() / Math.max(1, game.timer());
    const shots = game.aim_shots();
    const acc = shots > 0 ? Math.round((game.aim_hits() / shots) * 100) : 0;

    const shardBars = owned.length > 0
      ? owned.slice(0, 8).map((s) =>
        `<div class="spectrum-bar-row">` +
          `<span class="spectrum-bar-name" style="color:${s.color}">${s.name}</span>` +
          `<div class="spectrum-bar-track"><div class="spectrum-bar-fill" style="width:${(s.lvl / 6) * 100}%;background:${s.color}"></div></div>` +
          `<span class="spectrum-bar-lvl" style="color:${s.color}">L${s.lvl}</span>` +
        `</div>`,
      ).join('')
      : '<div style="opacity:0.5;padding:6px 0">Collect diamond crystal gems to forge your shard spectrum.</div>';

    const synLine = activeSyn.length > 0
      ? `<div style="margin-top:8px;color:#ffd95e">⚡ SYNERGIES · ${activeSyn.map(escapeHtml).join(' / ')}</div>`
      : '';
    const evoLine = activeEvo.length > 0
      ? `<div style="margin-top:4px;color:#ffba49">★ EVOLUTIONS · ${activeEvo.map(escapeHtml).join(' / ')}</div>`
      : '';
    const aimLine = shots > 0 || game.aim_drills_completed() > 0
      ? `<div style="margin-top:6px;color:#7df4ff">AIM MASTERY · TIER ${game.aim_tier()} · ${acc}% ACC · ${game.aim_drills_completed()} DRILLS</div>`
      : '';

    pauseBuildEl.innerHTML =
      `<div style="display:flex;justify-content:space-between;color:#eefaff;margin-bottom:10px">` +
        `<span>BUILD SPECTRUM · SEED #${game.seed()}${isDailyRun ? ' (DAILY)' : ''}</span>` +
        `<span>${formatCompact(dps)} DPS · PEAK ×${game.peak_kill_streak()}</span>` +
      `</div>` +
      shardBars + synLine + evoLine + aimLine;
  };

  const togglePause = (): void => {
    if (!isStarted || deathShown || modalShown) return;
    isPaused = !isPaused;
    if (isPaused) {
      renderPauseBuild();
      pauseMenuEl.classList.add('shown');
      audio.duck(true);
    } else {
      pauseMenuEl.classList.remove('shown');
      audio.duck(false);
      input.clearKeys();
      last = performance.now();
    }
    syncCursorVisibility();
  };

  btnResume.addEventListener('click', togglePause);
  sysPauseBtn.addEventListener('click', togglePause);
  btnRestartPause.addEventListener('click', () => startNewRun((Math.random() * 0xffffffff) >>> 0, false));

  const handleToggleSfx = (): void => {
    ensureAudio();
    audio.toggleSfx();
    syncSettingsButtons();
  };
  const handleToggleMusic = (): void => {
    ensureAudio();
    audio.toggleMusic();
    syncSettingsButtons();
  };
  btnToggleSound.addEventListener('click', handleToggleSfx);
  sysMuteBtn.addEventListener('click', handleToggleSfx);
  btnToggleMusic.addEventListener('click', handleToggleMusic);
  sysMusicBtn.addEventListener('click', handleToggleMusic);

  btnToggleFx.addEventListener('click', () => {
    const order: VisualQuality[] = ['high', 'balanced', 'reduced'];
    const next = order[(order.indexOf(renderer.getQuality()) + 1) % order.length]!;
    renderer.setQuality(next);
    try { window.localStorage.setItem(QUALITY_STORAGE_KEY, next); } catch { /* ignore */ }
    syncSettingsButtons();
  });

  btnToggleNumbers.addEventListener('click', () => {
    numbersEnabled = !numbersEnabled;
    overlay.setEnabled(numbersEnabled);
    try { window.localStorage.setItem(NUMBERS_STORAGE_KEY, numbersEnabled ? '1' : '0'); } catch { /* ignore */ }
    syncSettingsButtons();
  });

  window.addEventListener('resize', () => {
    applySize();
    if (game) game.resize(viewW, viewH);
  });

  statusEl.textContent = 'prism';

  // --- Holographic Collectible Shard Picker ------------------------------

  const updateModalFocusVisual = (): void => {
    const cards = levelupCardsEl.querySelectorAll<HTMLButtonElement>('.shard-card');
    cards.forEach((c, idx) => c.classList.toggle('gamepad-focus', idx === modalFocusIdx));
  };

  const getSmartSynergyCallout = (shardIdx: number, nextLevel: number): { text: string; ready: boolean } | null => {
    let bestNear: string | null = null;
    for (const [a, b, synName] of SYNERGY_PAIRS) {
      if (a !== shardIdx && b !== shardIdx) continue;
      const partner = a === shardIdx ? b : a;
      const partnerLvl = game.inventory_level(partner);
      if (partnerLvl >= 3 && nextLevel === 3) {
        return { text: `⚡ UNLOCKS ${synName} NOW!`, ready: true };
      }
      if (partnerLvl > 0 && partnerLvl < 3) {
        bestNear = `◈ PAIRS WITH ${SHARDS[partner]!.name} (L${partnerLvl}) → ${synName}`;
      } else if (partnerLvl >= 3 && nextLevel < 3) {
        bestNear = `◈ ${3 - nextLevel} LVL TO UNLOCK ${synName}!`;
      }
    }
    if (bestNear) return { text: bestNear, ready: false };
    const first = SHARDS[shardIdx]?.synergies[0];
    return first ? { text: `SYN · ${first}`, ready: false } : null;
  };

  const attachHoloTilt = (card: HTMLButtonElement): void => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 11;
      const ry = (px - 0.5) * 11;
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      card.style.transform = `translateY(-6px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  };

  const renderLevelUpCards = (): void => {
    levelupCardsEl.innerHTML = '';
    levelupFooterEl.innerHTML = '';
    modalFocusIdx = 0;

    for (let slot = 0; slot < 3; slot++) {
      const offerType = game.level_choice_type(slot);
      const offerIdx = game.level_choice(slot);
      if (offerType < 0 || offerIdx < 0) continue;

      const card = document.createElement('button');
      card.className = 'shard-card';
      card.type = 'button';

      if (offerType === 1) {
        if (offerIdx >= EVOLUTIONS.length) continue;
        const meta = EVOLUTIONS[offerIdx]!;
        card.style.setProperty('--sc', meta.color);
        card.innerHTML =
          `<div class="shard-top-row">` +
            `<div class="shard-emblem">${getEvolutionSvg(offerIdx, meta.color)}</div>` +
            `<div class="shard-tag-col">` +
              `<span class="shard-rarity evolution">★ EVOLUTION</span>` +
              `<span class="shard-hotkey-badge">[${slot + 1}]</span>` +
            `</div>` +
          `</div>` +
          `<div class="shard-name">${meta.name}</div>` +
          `<div class="shard-syn-callout ready">${meta.recipe}</div>` +
          `<div class="shard-desc">${meta.desc}</div>`;
      } else {
        if (offerIdx >= SHARDS.length) continue;
        const meta = SHARDS[offerIdx]!;
        const currentLevel = game.inventory_level(offerIdx);
        const nextLevel = currentLevel + 1;
        card.style.setProperty('--sc', meta.color);

        const diamonds = Array.from({ length: 6 }, (_, n) => {
          const lvl = n + 1;
          const cls = lvl <= currentLevel ? 'owned' : lvl === nextLevel ? 'next' : '';
          return `<span class="shard-diamond ${cls}"></span>`;
        }).join('');

        const syn = getSmartSynergyCallout(offerIdx, nextLevel);
        const synHtml = syn
          ? `<div class="shard-syn-callout${syn.ready ? ' ready' : ''}">${escapeHtml(syn.text)}</div>`
          : '';

        card.innerHTML =
          `<div class="shard-top-row">` +
            `<div class="shard-emblem">${getShardSvg(offerIdx, meta.color)}</div>` +
            `<div class="shard-tag-col">` +
              `<span class="shard-rarity ${meta.rarity}">${meta.rarity}</span>` +
              `<span class="shard-hotkey-badge">[${slot + 1}]</span>` +
            `</div>` +
          `</div>` +
          `<div class="shard-name">${meta.name}</div>` +
          `<div class="shard-diamonds">${diamonds}<span class="shard-level-txt">L${currentLevel}→${nextLevel}</span></div>` +
          `<div class="shard-desc">${meta.desc}</div>` +
          synHtml;
      }

      attachHoloTilt(card);
      card.addEventListener('mouseenter', () => {
        audio.playUiHover();
        modalFocusIdx = slot;
        updateModalFocusVisual();
      });
      card.addEventListener('click', () => {
        audio.playUiSelect();
        game.select_shard(slot);
      });
      levelupCardsEl.appendChild(card);
    }

    const charges = game.reroll_charges();
    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'prism-btn ghost';
    rerollBtn.type = 'button';
    rerollBtn.disabled = charges === 0;
    rerollBtn.textContent = `REROLL [R / Y]  ×${charges}`;
    rerollBtn.addEventListener('click', () => {
      audio.playUiSelect();
      game.reroll_level_up();
      renderLevelUpCards();
    });
    levelupFooterEl.appendChild(rerollBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'prism-btn ghost';
    skipBtn.type = 'button';
    skipBtn.textContent = 'SKIP [X / B]  +6 HULL';
    skipBtn.addEventListener('click', () => {
      audio.playUiSelect();
      game.skip_level_up();
    });
    levelupFooterEl.appendChild(skipBtn);

    updateModalFocusVisual();
  };

  const showLevelUpModal = (): void => {
    input.clearKeys();
    levelupRankEl.textContent = 'RANK ' + game.rank();
    renderLevelUpCards();
    levelupEl.classList.add('shown');
    audio.duck(true);
    modalShown = true;
    syncCursorVisibility();
  };

  const hideLevelUpModal = (): void => {
    levelupEl.classList.remove('shown');
    levelupCardsEl.innerHTML = '';
    levelupFooterEl.innerHTML = '';
    audio.duck(false);
    modalShown = false;
    syncCursorVisibility();
  };

  // --- Bespoke Victory / Shattered Run Story Screen ----------------------

  const showDeathScreen = (victory: boolean): void => {
    if (victory) {
      deathTitleEl.textContent = 'VICTORY';
      deathTitleEl.classList.add('victory-title');
      btnContinueEndless.classList.add('shown');
    } else {
      deathTitleEl.textContent = game.is_endless() ? 'ENDLESS FALL' : 'SHATTERED';
      deathTitleEl.classList.remove('victory-title');
      btnContinueEndless.classList.remove('shown');
    }
    deathScoreEl.textContent = `${game.score()} PTS`;

    const t = game.timer();
    const timeStr = formatTime(t);
    const dmgTaken = Math.round(game.damage_taken());
    const barrierAbs = Math.round(game.barrier_absorbed());
    const bossKills = game.boss_kills_count();
    const peakStreak = game.peak_kill_streak();
    const avgDps = game.total_damage_dealt() / Math.max(1, t);
    const aimShots = game.aim_shots();
    const aimHits = game.aim_hits();
    const aimAcc = aimShots > 0 ? Math.round((aimHits / aimShots) * 100) : 0;
    const deathCauseIdx = game.death_cause();
    const deathCause = !victory && deathCauseIdx >= 0
      ? (DAMAGE_SOURCE_NAMES[deathCauseIdx] ?? 'UNKNOWN')
      : undefined;

    const activeSynergies = SYNERGY_NAMES.filter((_, i) => ((game.active_synergy_bits() >>> i) & 1) === 1);
    const activeEvolutions = EVOLUTIONS.filter((_, i) => ((game.active_evolution_bits() >>> i) & 1) === 1).map((e) => e.name);
    const ownedShards = SHARDS.map((s, i) => ({ name: s.name, color: s.color, level: game.inventory_level(i) }))
      .filter((s) => s.level > 0)
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));

    const summary: StoredRunSummary = {
      version: 1,
      savedAt: new Date().toISOString(),
      outcome: victory ? 'VICTORY' : 'DEATH',
      seed: game.seed(),
      daily: isDailyRun,
      deathCause,
      score: game.score(),
      timeSeconds: Math.floor(t),
      rank: game.rank(),
      peakRank: game.peak_rank(),
      kills: game.kills_total(),
      peakStreak,
      bossKills,
      damageTaken: dmgTaken,
      barrierAbsorbed: barrierAbs,
      gems: game.gems_collected(),
      skips: game.skip_count(),
      rerolls: game.reroll_count(),
      aimTier: game.aim_tier(),
      aimDrills: game.aim_drills_completed(),
      maxObserved: {
        enemies: game.max_enemies_observed(),
        circles: game.max_circles_observed(),
        beams: game.max_beams_observed(),
      },
      synergies: activeSynergies,
      evolutions: activeEvolutions,
      topShards: ownedShards.slice(0, 5).map(({ name, level }) => ({ name, level })),
    };
    const { runs, isNewBest } = saveRunSummary(summary);
    updateTitleBestBadge();

    const spectrumBarsHtml = ownedShards.length > 0
      ? ownedShards.slice(0, 8).map((s) =>
        `<div class="spectrum-bar-row">` +
          `<span class="spectrum-bar-name" style="color:${s.color}">${s.name}</span>` +
          `<div class="spectrum-bar-track"><div class="spectrum-bar-fill" style="width:${(s.level / 6) * 100}%;background:${s.color};box-shadow:0 0 8px ${s.color}88"></div></div>` +
          `<span class="spectrum-bar-lvl" style="color:${s.color}">L${s.level}</span>` +
        `</div>`,
      ).join('')
      : '<div style="opacity:0.5">No shards acquired</div>';

    const synRibbon = activeSynergies.length > 0
      ? `<div style="margin-top:10px;color:#ffd95e;font-size:9px">⚡ ${activeSynergies.map(escapeHtml).join(' · ')}</div>`
      : '';
    const evoRibbon = activeEvolutions.length > 0
      ? `<div style="margin-top:4px;color:#ffba49;font-size:9px">★ ${activeEvolutions.map(escapeHtml).join(' · ')}</div>`
      : '';

    const lbHtml = runs.map((r, idx) => {
      const cur = r.savedAt === summary.savedAt ? ' current-run' : '';
      return `<div class="best-run-line${cur}">${idx + 1}. ${r.score} PTS · ${formatTime(r.timeSeconds)} · ${r.outcome}</div>`;
    }).join('');

    const leftCol =
      `<div>` +
        `<div class="recap-section-title">OPTICAL BUILD SPECTRUM</div>` +
        spectrumBarsHtml + synRibbon + evoRibbon +
        `<div class="recap-section-title" style="margin-top:14px">RANK VELOCITY (0:00 → ${timeStr})</div>` +
        buildRankSparklineSvg(game, t / 60) +
      `</div>`;

    const rightCol =
      `<div>` +
        `<div class="recap-section-title">RUN DOSSIER · SEED #${game.seed()}</div>` +
        `<div class="dossier-row"><span class="dossier-label">SURVIVAL TIME</span><span class="dossier-val">${timeStr} (RANK ${game.rank()})</span></div>` +
        `<div class="dossier-row"><span class="dossier-label">HOSTILES SHATTERED</span><span class="dossier-val">${game.kills_total()} (PEAK ×${peakStreak})</span></div>` +
        `<div class="dossier-row"><span class="dossier-label">AVERAGE DPS</span><span class="dossier-val">${formatCompact(avgDps)} / s</span></div>` +
        `<div class="dossier-row"><span class="dossier-label">BOSSES DEFEATED</span><span class="dossier-val">${bossKills}</span></div>` +
        `<div class="dossier-row"><span class="dossier-label">HULL DMG / SHIELD</span><span class="dossier-val">${dmgTaken} / ${barrierAbs}</span></div>` +
        (aimShots > 0 || game.aim_drills_completed() > 0
          ? `<div class="dossier-row"><span class="dossier-label">AIM MASTERY</span><span class="dossier-val" style="color:#ffd95e">TIER ${game.aim_tier()} · ${aimAcc}% ACC · ${game.aim_drills_completed()} DRILLS</span></div>`
          : '') +
        (deathCause ? `<div class="dossier-row"><span class="dossier-label">FINAL BLOW</span><span class="dossier-val" style="color:#ff6b8b">${escapeHtml(deathCause)}</span></div>` : '') +
        `<div class="best-run-panel"><div class="recap-section-title" style="margin-bottom:4px">${isNewBest ? '★ NEW PERSONAL BEST' : 'LEADERBOARD'}</div>${lbHtml}</div>` +
      `</div>`;

    deathStatsEl.innerHTML = leftCol + rightCol;
    deathScreenEl.classList.add('shown');
    deathShown = true;
    btnCopyTelemetry.textContent = 'COPY TELEMETRY';
    syncCursorVisibility();
    if (victory) audio.playVictory();
    else audio.playDeath();

    const shardText = ownedShards.map((s) => `${s.name} L${s.level}`).join(', ');
    lastRunTelemetryText =
      `PRISM ${victory ? 'VICTORY' : 'RUN'} | Seed #${game.seed()}${isDailyRun ? ` (Daily ${daily.dateLabel})` : ''}\n` +
      `Score: ${game.score()} | Time: ${timeStr} | Rank: ${game.rank()} | Kills: ${game.kills_total()} (Peak ×${peakStreak})\n` +
      `Avg DPS: ${Math.round(avgDps)} | Aim Tier: ${game.aim_tier()} (${aimAcc}% acc, ${game.aim_drills_completed()} drills)\n` +
      `Shards: ${shardText || 'none'} | Synergies: ${activeSynergies.join(', ') || 'none'}`;
  };

  const hideDeathScreen = (): void => {
    deathScreenEl.classList.remove('shown');
    deathShown = false;
    resetHudCache();
    syncCursorVisibility();
  };

  const doRestart = (): void => {
    if (!deathShown) return;
    startNewRun((Math.random() * 0xffffffff) >>> 0, false);
  };

  btnContinueEndless.addEventListener('click', () => {
    if (!deathShown || !game.is_victory()) return;
    ensureAudio();
    audio.playUiSelect();
    game.continue_endless();
    hideDeathScreen();
    input.clearKeys();
    overlay.announce('ENDLESS OVERDRIVE', '#ffd95e', 'ESCALATING WAVES & OVERDRIVE BOSSES');
    last = performance.now();
  });

  btnCopyTelemetry.addEventListener('click', () => {
    if (!lastRunTelemetryText || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(lastRunTelemetryText).then(() => {
      btnCopyTelemetry.textContent = 'COPIED!';
    });
  });

  deathRestartEl.addEventListener('click', doRestart);

  window.addEventListener('keydown', (e) => {
    if (!isStarted) {
      if (e.key === 'Enter' || e.key === ' ') {
        startNewRun((Math.random() * 0xffffffff) >>> 0, false);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') {
      togglePause();
      e.preventDefault();
      return;
    }
    if (modalShown) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 3) {
        audio.playUiSelect();
        game.select_shard(n - 1);
        e.preventDefault();
      } else if (e.key === 'x' || e.key === 'X') {
        audio.playUiSelect();
        game.skip_level_up();
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        if (game.reroll_charges() > 0) {
          audio.playUiSelect();
          game.reroll_level_up();
          renderLevelUpCards();
        }
        e.preventDefault();
      }
      return;
    }
    if (deathShown && (e.key === ' ' || e.key === 'Enter')) {
      doRestart();
      e.preventDefault();
    }
  });

  // --- Main RAF Loop -----------------------------------------------------

  let last = performance.now();
  let fpsLast = last;
  let fpsFrames = 0;
  let lastGamepadShown = false;

  const frame = (now: number): void => {
    const rawDt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    input.pollGamepad(modalShown, rawDt);
    const padNow = input.hasGamepad();
    if (padNow !== lastGamepadShown) {
      sysUplinkEl.textContent = padNow ? '● TWIN-STICK PAD' : '● ONLINE';
      lastGamepadShown = padNow;
    }
    if (input.consumePause()) {
      if (!isStarted) startNewRun((Math.random() * 0xffffffff) >>> 0, false);
      else togglePause();
    }

    // Interactive mouse-reactive spinning crystal globe on Title Screen!
    if (!isStarted) {
      audio.updateMusicState(true, 0.1, false);
      const t = now / 1000;
      const camX = t * 44;
      const camY = Math.sin(t * 0.22) * 170;
      // Place hero crystal right-of-center so it balances the left editorial title column!
      const anchorX = camX + Math.min(230, viewW * 0.20);
      const anchorY = camY;
      const [mx, my] = input.peekAimOffset();
      const mouseAngle = Math.atan2(my, mx - Math.min(230, viewW * 0.20));

      let cIdx = 0;
      const putCircle = (
        x: number, y: number, r: number,
        cr: number, cg: number, cb: number, ca: number, glow: number, shape: number,
      ): void => {
        const o = cIdx * CIRCLE_STRIDE_FLOATS;
        attractCircles[o] = x; attractCircles[o + 1] = y; attractCircles[o + 2] = r;
        attractCircles[o + 3] = cr; attractCircles[o + 4] = cg; attractCircles[o + 5] = cb;
        attractCircles[o + 6] = ca; attractCircles[o + 7] = glow; attractCircles[o + 8] = shape;
        cIdx++;
      };

      putCircle(anchorX, anchorY, 82, 0.35, 0.85, 1.0, 0.38, 1.6, 4.0);
      putCircle(anchorX, anchorY, 34, 0.72, 0.96, 1.0, 0.98, 1.6, 5.0);
      for (let i = 0; i < 6; i++) {
        // Subtle mouse-reactive refraction fan!
        const a = t * 0.42 + mouseAngle * 0.35 + (i * Math.PI * 2) / 6;
        const ox = anchorX + Math.cos(a) * 145;
        const oy = anchorY + Math.sin(a) * 145;
        const hue = i / 6;
        const cr = 0.5 + 0.5 * Math.cos(hue * Math.PI * 2);
        const cg = 0.5 + 0.5 * Math.cos(hue * Math.PI * 2 + 2.094);
        const cb = 0.5 + 0.5 * Math.cos(hue * Math.PI * 2 + 4.189);
        putCircle(ox, oy, 12, cr, cg, cb, 0.92, 2.0, 1.0);

        const bo = i * BEAM_AUGMENTED_STRIDE;
        attractBeams[bo] = anchorX; attractBeams[bo + 1] = anchorY;
        attractBeams[bo + 2] = anchorX + Math.cos(a) * 440;
        attractBeams[bo + 3] = anchorY + Math.sin(a) * 440;
        attractBeams[bo + 4] = 2.2;
        attractBeams[bo + 5] = cr; attractBeams[bo + 6] = cg; attractBeams[bo + 7] = cb;
        attractBeams[bo + 8] = 0.62; attractBeams[bo + 9] = 2.0; attractBeams[bo + 10] = 1.0;
      }

      renderer.render(
        pixelW, pixelH, viewW, viewH,
        [camX, camY],
        attractCircles, cIdx,
        attractBeams, 6,
        [0, 0], t, game.arena_radius(),
        { intensity: 0.45, screenFlash: 0, damageFlash: 0, lowHp: 0, bossMood: 0 },
      );
      requestAnimationFrame(frame);
      return;
    }

    if (isPaused) {
      requestAnimationFrame(frame);
      return;
    }

    // Gamepad navigation inside Level-Up modal.
    if (modalShown) {
      const act = input.consumeModalAction();
      if (act === 'prev') {
        modalFocusIdx = (modalFocusIdx + 2) % 3;
        audio.playUiHover();
        updateModalFocusVisual();
      } else if (act === 'next') {
        modalFocusIdx = (modalFocusIdx + 1) % 3;
        audio.playUiHover();
        updateModalFocusVisual();
      } else if (act === 'confirm') {
        audio.playUiSelect();
        game.select_shard(modalFocusIdx);
      } else if (act === 'reroll' && game.reroll_charges() > 0) {
        audio.playUiSelect();
        game.reroll_level_up();
        renderLevelUpCards();
      } else if (act === 'skip') {
        audio.playUiSelect();
        game.skip_level_up();
      }
    }

    syncCursorVisibility();

    // Presentation-side hit-stop micro slow-mo.
    let simDt = rawDt;
    if (hitStopTimer > 0) {
      hitStopTimer = Math.max(0, hitStopTimer - rawDt);
      simDt = rawDt * 0.22;
    }

    const [ix, iy] = input.direction();
    const aim = input.consumeAim();
    game.set_input(ix, iy);
    game.set_dash_input(input.consumeDash());
    game.set_aim_input(aim.offsetX, aim.offsetY, aim.active, aim.clicked && !modalShown && !deathShown, aim.held && !modalShown && !deathShown);
    game.update(simDt);

    const pulseHitStop = game.hit_stop_pulse();
    if (pulseHitStop > 0.1) hitStopTimer = Math.max(hitStopTimer, 0.024 + pulseHitStop * 0.028);

    let totalShardLevels = 0;
    for (let i = 0; i < SHARDS.length; i++) totalShardLevels += game.inventory_level(i);
    const intensity = Math.min(1.0, totalShardLevels / 40.0);
    const bossActive = game.boss_active();
    const eventBits = game.audio_event_bits();
    const activeBits = game.active_synergy_bits();
    const activeEvoBits = game.active_evolution_bits();
    const streak = game.kill_streak();
    const aimTracking = game.aim_tracking_active();
    const aimTrackProgress = game.aim_track_progress();
    const aimCombo = game.aim_combo();

    if (!deathShown && !modalShown) {
      audio.tick(
        rawDt,
        game.audio_beam_count(),
        game.audio_kill_count(),
        game.audio_gem_count(),
        eventBits,
        activeBits,
        intensity,
        bossActive,
        streak,
        aimTracking,
        aimTrackProgress,
        aimCombo,
      );
    }

    // Visual hit-marker & callout banners.
    if (eventBits & AUDIO_AIM_HIT) overlay.pulseHitMarker();
    if (eventBits & AUDIO_AIM_MISS) overlay.pulseMissMarker();
    if (eventBits & AUDIO_AIM_COMPLETE) {
      overlay.pulseHitMarker();
      overlay.announce(`PRISM OVERDRIVE · TIER ${game.aim_tier()}`, '#ffe066', `AIM CHAIN ×${aimCombo}`);
    }
    if (eventBits & AUDIO_BOSS_SPAWN) {
      overlay.announce(`WARNING · ${BOSS_NAMES[game.boss_kind_index()] ?? 'ANCIENT PRISM'}`, '#ffad5c', 'ARENA CROWD CLEARED');
    }
    if (eventBits & AUDIO_SHIELD_BREAK) overlay.announce('SHIELD SHATTERED', '#ffe26a', 'SENTINEL CORE EXPOSED');
    if (eventBits & AUDIO_STREAK_MILESTONE) overlay.announce(`×${streak} KILL STREAK`, streak >= 100 ? '#ff8df2' : '#ffd95e');

    const newSynergies = activeBits & ~announcedSynergyBits;
    if (newSynergies !== 0) {
      for (let i = 0; i < SYNERGY_NAMES.length; i++) {
        if ((newSynergies >>> i) & 1) overlay.announce(`⚡ SYNERGY · ${SYNERGY_NAMES[i]}`, '#ffd95e');
      }
      announcedSynergyBits = activeBits;
    }
    const newEvos = activeEvoBits & ~announcedEvoBits;
    if ((eventBits & AUDIO_EVOLUTION) || newEvos !== 0) {
      for (let i = 0; i < EVOLUTIONS.length; i++) {
        if ((newEvos >>> i) & 1) overlay.announce(`★ EVOLUTION · ${EVOLUTIONS[i]!.name}`, EVOLUTIONS[i]!.color, EVOLUTIONS[i]!.desc.toUpperCase());
      }
      announcedEvoBits = activeEvoBits;
    }

    if (game.is_dead() && !deathShown) showDeathScreen(game.is_victory());

    const dashPct = game.dash_cooldown_pct();
    dashFillEl.style.width = ((1 - dashPct) * 100) + '%';
    waveClearEl.classList.toggle('shown', game.wave_clear_timer() > 0);

    const isLeveling = game.is_leveling_up();
    if (isLeveling && !modalShown) showLevelUpModal();
    if (!isLeveling && modalShown) hideLevelUpModal();

    // Update live Aim-Trainer HUD badge.
    if (aim.active) {
      aimHudEl.classList.add('shown');
      aimTierValEl.textContent = `AIM TIER ${game.aim_tier()}`;
      aimComboValEl.textContent = `CHAIN ×${aimCombo}`;
      const shots = game.aim_shots();
      aimAccValEl.textContent = shots > 0 ? `${Math.round((game.aim_hits() / shots) * 100)}% ACC` : 'READY';
      if (aimTargetsLen > 0) {
        const k = Math.round(aimTargetsView[3]!);
        aimDrillValEl.textContent = k === 0 ? 'FLICK CHAIN' : k === 1 ? 'SMOOTH TRACK' : 'MICRO CLUSTER';
      } else {
        aimDrillValEl.textContent = 'PRECISION LANCE';
      }
    }

    const rank = game.rank();
    if (rank !== lastRank) { rankEl.textContent = String(rank); lastRank = rank; }
    const kills = game.kills_total();
    const score = game.score();
    if (kills !== lastKills || score !== lastScore) {
      killsEl.textContent = `${kills} KILLS · ${score} PTS`;
      lastKills = kills; lastScore = score;
    }
    if (streak !== lastStreak) {
      comboWrapEl.classList.toggle('shown', streak >= 3);
      if (streak >= 3) {
        comboValEl.textContent = `×${streak} STREAK`;
        comboValEl.classList.toggle('hot', streak >= 25 && streak < 75);
        comboValEl.classList.toggle('super', streak >= 75);
      }
      lastStreak = streak;
    }
    if (streak >= 3) comboFillEl.style.width = (game.kill_streak_timer_pct() * 100) + '%';

    const xp = game.xp();
    const xpNeeded = game.xp_needed();
    const xpPct = xpNeeded > 0 ? Math.round(Math.min(100, (xp / xpNeeded) * 100)) : 0;
    if (xpPct !== lastXpPct) {
      xpFillEl.style.transition = xpPct < lastXpPct ? 'none' : '';
      xpFillEl.style.width = xpPct + '%';
      lastXpPct = xpPct;
    }
    if (xp !== lastXp || xpNeeded !== lastXpNeeded) {
      xpRankLabelEl.textContent = `RADIANCE TO RANK ${rank + 1}`;
      xpValEl.textContent = `${xp} / ${xpNeeded}`;
      lastXp = xp; lastXpNeeded = xpNeeded;
    }

    const hp = game.hp();
    const maxHp = game.max_hp();
    const hpPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 100;
    if (hp !== lastHp || maxHp !== lastMaxHp) {
      hpValEl.textContent = `${Math.ceil(hp)} / ${Math.round(maxHp)}`;
      lastHp = hp; lastMaxHp = maxHp;
    }
    if (hpPct !== lastHpPct) {
      hpFillEl.style.width = hpPct + '%';
      hpFillEl.classList.toggle('crit', hpPct <= 25);
      hpFillEl.classList.toggle('warn', hpPct > 25 && hpPct <= 50);
      lastHpPct = hpPct;
    }

    const dashReady = dashPct === 0;
    if (dashReady !== lastDashReady) {
      dashStatusEl.textContent = dashReady ? 'READY' : 'RECHARGING';
      lastDashReady = dashReady;
    }

    const timerStr = formatTime(game.timer());
    if (timerStr !== lastTimerStr) { timerEl.textContent = timerStr; lastTimerStr = timerStr; }
    const wave = game.wave();
    if (wave !== lastWave) { waveLabelEl.textContent = `WAVE ${wave + 1}`; lastWave = wave; }
    const endlessNow = game.is_endless();
    if (endlessNow !== lastEndless) { endlessBadgeEl.classList.toggle('shown', endlessNow); lastEndless = endlessNow; }

    if (bossActive !== lastBossActive) {
      bossHudEl.classList.toggle('shown', bossActive);
      lastBossActive = bossActive; lastBossPct = -1; lastBossKind = -2;
    }
    let bossLabel = 'PRISM BOSS';
    if (bossActive) {
      const bossKind = game.boss_kind_index();
      bossLabel = BOSS_NAMES[bossKind] ?? 'UNKNOWN PRISM';
      if (bossKind !== lastBossKind) { bossNameEl.textContent = bossLabel; lastBossKind = bossKind; }
      const bossPct = Math.max(0, Math.min(100, Math.round(game.boss_hp_pct() * 100)));
      if (bossPct !== lastBossPct) { bossFillEl.style.width = bossPct + '%'; lastBossPct = bossPct; }
    }

    for (let i = 0; i < SHARDS.length; i++) {
      const lvl = game.inventory_level(i);
      if (lvl !== lastPipLevels[i]) {
        const wrap = pips[i]!;
        const hex = wrap.firstElementChild as HTMLElement;
        const lvlLabel = wrap.lastElementChild as HTMLElement;
        const color = SHARDS[i]!.color;
        if (lvl > 0) {
          wrap.style.display = '';
          hex.style.background = `linear-gradient(160deg, ${color}, ${color}88)`;
          hex.style.boxShadow = `0 0 ${8 + lvl * 2}px ${color}`;
          hex.style.borderColor = color;
          lvlLabel.textContent = `L${lvl}`;
          lvlLabel.style.color = color;
        } else {
          wrap.style.display = 'none';
        }
        lastPipLevels[i] = lvl;
      }
    }

    const nearBits = game.near_synergy_bits();
    if (activeBits !== lastActiveBits || nearBits !== lastNearBits) {
      for (let i = 0; i < synergyTags.length; i++) {
        const tag = synergyTags[i]!;
        const isActive = ((activeBits >>> i) & 1) === 1;
        const isNear = ((nearBits >>> i) & 1) === 1;
        if (isActive) { tag.style.display = ''; tag.className = 'synergy-tag active'; }
        else if (isNear) { tag.style.display = ''; tag.className = 'synergy-tag near'; }
        else { tag.style.display = 'none'; tag.className = 'synergy-tag'; }
      }
      lastActiveBits = activeBits; lastNearBits = nearBits;
    }

    refreshBuffers();

    const beamCount = beamsLen;
    let renderBeams: Float32Array;
    if (beamCount > 0) {
      const needed = beamCount * BEAM_AUGMENTED_STRIDE;
      if (augBeamBuf.length < needed) augBeamBuf = new Float32Array(needed);

      const keysThisFrame = new Set<string>();
      for (let i = 0; i < beamCount; i++) {
        const src = i * BEAM_STRIDE_FLOATS;
        const dst = i * BEAM_AUGMENTED_STRIDE;
        for (let j = 0; j < BEAM_STRIDE_FLOATS; j++) augBeamBuf[dst + j] = beamsView[src + j]!;
        const key = `${Math.round(beamsView[src + 2]! * 0.25)},${Math.round(beamsView[src + 3]! * 0.25)},${Math.round(beamsView[src + 5]! * 8)}`;
        keysThisFrame.add(key);
        let entry = beamBirthTimes.get(key);
        if (!entry) {
          entry = { birth: now, duration: 24 + Math.random() * 44 };
          beamBirthTimes.set(key, entry);
        }
        augBeamBuf[dst + 10] = Math.min(1.0, (now - entry.birth) / entry.duration);
      }
      for (const key of beamBirthTimes.keys()) {
        if (!keysThisFrame.has(key)) beamBirthTimes.delete(key);
      }
      renderBeams = augBeamBuf.subarray(0, needed);
    } else {
      renderBeams = beamsView;
    }

    const camX = game.camera_x();
    const camY = game.camera_y();
    const shakeX = game.shake_x();
    const shakeY = game.shake_y();
    const arenaR = game.arena_radius();
    const lowHpFactor = maxHp > 0 ? Math.max(0, (0.30 - hp / maxHp) / 0.30) : 0;

    renderer.render(
      pixelW, pixelH, viewW, viewH,
      [camX, camY],
      circlesView, circlesLen,
      renderBeams, beamCount,
      [shakeX, shakeY],
      now / 1000,
      arenaR,
      {
        intensity,
        screenFlash: game.screen_flash(),
        damageFlash: game.damage_flash(),
        lowHp: lowHpFactor,
        bossMood: bossActive ? 1.0 : 0.0,
      },
    );

    overlay.ingestPopups(popupsView, popupsLen);
    overlay.render(
      rawDt,
      camX, camY, shakeX, shakeY, arenaR,
      bossActive, game.boss_world_x(), game.boss_world_y(), bossLabel,
      {
        active: aim.active && !modalShown && !deathShown,
        offsetX: aim.offsetX,
        offsetY: aim.offsetY,
        hovering: game.aim_hovering_target(),
        tracking: aimTracking,
        trackProgress: aimTrackProgress,
        hasPrevLink: game.aim_has_prev_link(),
        lastHitX: game.aim_last_hit_x(),
        lastHitY: game.aim_last_hit_y(),
        targetsView: aimTargetsView,
        targetsLen: aimTargetsLen,
      },
    );

    fpsFrames++;
    if (now - fpsLast > 500) {
      const fps = (fpsFrames * 1000) / (now - fpsLast);
      statusEl.textContent = `${fps.toFixed(0)} fps · ${game.enemy_count()}e ${circlesLen}s ${beamsLen}b`;
      fpsFrames = 0;
      fpsLast = now;
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const s = document.getElementById('status');
  if (s) s.textContent = 'failed to load — see console';
});
