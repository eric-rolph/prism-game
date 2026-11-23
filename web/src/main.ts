// Bootstrap for Prism — wires WASM ↔ WebGL2 Renderer ↔ 2D Overlay ↔ Input (KB/Touch/Gamepad) ↔ Audio DSP.
// Zero-copy Float32Array views read CircleInstance (9 floats), BeamInstance (10 floats),
// and DamagePopup (4 floats) directly out of WebAssembly linear memory.

import init, { Game } from '../wasm/prism.js';
import { Renderer, VisualQuality } from './renderer.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { OverlayRenderer } from './overlay.js';

const CIRCLE_STRIDE_FLOATS = 9;
const BEAM_STRIDE_FLOATS = 10;       // layout from WASM (read only)
const BEAM_AUGMENTED_STRIDE = 11;    // +1 form_progress float injected before upload
const POPUP_STRIDE_FLOATS = 4;

const AUDIO_BOSS_SPAWN = 1 << 2;
const AUDIO_SHIELD_BREAK = 1 << 4;
const AUDIO_STREAK_MILESTONE = 1 << 7;
const AUDIO_EVOLUTION = 1 << 8;

// Must stay in index-lock with Rust's SYNERGIES const (src/shards.rs).
// Order determines bit positions in active_synergy_bits() / near_synergy_bits().
const SYNERGY_NAMES: string[] = [
  'CHAIN REACTION', 'BLIZZARD', 'SUPERNOVA', 'PRISM CANNON', 'TRACKING ECHO',
  'FROZEN ORBIT', 'EVENT HORIZON', 'BLOOD PACT', 'MARTYRDOM', 'RESONANCE', 'GRAVITY WELL',
  'STATIC FREEZE', 'STORM FRONT', 'GRAVITY MINES', 'SEISMIC FIELD', 'TRIPWIRE GRID', 'PHASE WAKE',
  'RAIL FOCUS', 'SURGICAL DRAIN',
];
const BOSS_NAMES: string[] = ['PRISM SENTINEL', 'HYDRA', 'VOID PRISM — FINAL BOSS'];
const DAMAGE_SOURCE_NAMES: string[] = ['ENEMY CONTACT', 'PROJECTILE', 'BOSS CONTACT', 'VOID SHOCKWAVE'];
const RANK_TIMELINE_BUCKETS = 16;
const UPGRADE_PICK_SHARD = 0;
const UPGRADE_PICK_EVOLUTION = 1;
const UPGRADE_PICK_SKIP = 2;

// Must stay in index-lock with Rust's ShardKind enum (src/shards.rs).
type Rarity = 'common' | 'rare' | 'legendary' | 'evolution';
interface ShardMeta { name: string; color: string; desc: string; synergies: string[]; rarity: Rarity }
interface EvolutionMeta { name: string; color: string; desc: string; recipe: string }
const SHARDS: ShardMeta[] = [
  { name: 'SPLIT',        color: '#8effa3', rarity: 'common',    desc: 'fan out more beams per volley',        synergies: ['CASCADE → CHAIN REACTION', 'FROST → BLIZZARD'] },
  { name: 'REFRACT',      color: '#7fd3ff', rarity: 'rare',      desc: 'beams curve toward nearest enemy',     synergies: ['ECHO → TRACKING ECHO'] },
  { name: 'MIRROR',       color: '#c9a3ff', rarity: 'common',    desc: 'fire in every direction',              synergies: ['DIFFRACT → SUPERNOVA'] },
  { name: 'CHROMATIC',    color: '#ffa3c9', rarity: 'common',    desc: 'split into red / green / blue',        synergies: ['LENS → PRISM CANNON'] },
  { name: 'LENS',         color: '#ffe58e', rarity: 'common',    desc: 'thicker, heavier beams',               synergies: ['CHROMATIC → PRISM CANNON'] },
  { name: 'DIFFRACT',     color: '#8efff4', rarity: 'rare',      desc: 'hits scatter into radial bursts',      synergies: ['MIRROR → SUPERNOVA'] },
  { name: 'ECHO',         color: '#ff9d6c', rarity: 'rare',      desc: 'second salvo after a short delay',     synergies: ['REFRACT → TRACKING ECHO'] },
  { name: 'HALO',         color: '#f5f5bc', rarity: 'rare',      desc: 'orbital beads strike on contact',      synergies: ['FROST → FROZEN ORBIT', 'MOMENTUM → EVENT HORIZON'] },
  { name: 'CASCADE',      color: '#ff6f91', rarity: 'legendary', desc: 'kills fork into secondary beams',      synergies: ['SPLIT → CHAIN REACTION', 'THORNS → MARTYRDOM'] },
  { name: 'INTERFERENCE', color: '#9a9dff', rarity: 'legendary', desc: 'standing-wave pulses ripple outward',  synergies: ['BARRIER → RESONANCE', 'MAGNET → GRAVITY WELL', 'MINEFIELD → SEISMIC FIELD'] },
  { name: 'SIPHON',       color: '#a3ffdb', rarity: 'common',    desc: 'beams heal you on every hit',          synergies: ['THORNS → BLOOD PACT (close-range only)'] },
  { name: 'FROST',        color: '#b3e5fc', rarity: 'common',    desc: 'beams slow enemies on hit',            synergies: ['HALO → FROZEN ORBIT', 'SPLIT → BLIZZARD'] },
  { name: 'BARRIER',      color: '#64b5f6', rarity: 'common',    desc: 'energy shield absorbs + deals damage', synergies: ['INTERFERENCE → RESONANCE'] },
  { name: 'THORNS',       color: '#ef5350', rarity: 'rare',      desc: 'taking damage fires retaliatory beams',synergies: ['SIPHON → BLOOD PACT (close-range heal)', 'CASCADE → MARTYRDOM'] },
  { name: 'MAGNET',       color: '#7cffd4', rarity: 'common',    desc: 'pull radiance gems from farther away', synergies: ['INTERFERENCE → GRAVITY WELL', 'MINEFIELD → GRAVITY MINES'] },
  { name: 'MOMENTUM',     color: '#d7ff6f', rarity: 'common',    desc: 'move faster and shorten dash cooldown', synergies: ['HALO → EVENT HORIZON'] },
  { name: 'ARMOR',        color: '#9ab8d0', rarity: 'common',    desc: 'reduce all incoming damage by 8% per level', synergies: [] },
  { name: 'LUCK',         color: '#ffd740', rarity: 'rare',      desc: 'rare and legendary shards appear more often', synergies: [] },
  { name: 'PRISM HEART',  color: '#ff7eb3', rarity: 'common',    desc: '+15 max HP per level; level-up heals more',   synergies: [] },
  { name: 'PHASE STEP',   color: '#5fffff', rarity: 'rare',      desc: 'dash grants longer i-frames; L3: afterimage', synergies: ['MINEFIELD → PHASE WAKE'] },
  { name: 'ARC',          color: '#b58cff', rarity: 'rare',      desc: 'chain lightning leaps between nearby enemies', synergies: ['FROST → STATIC FREEZE', 'CASCADE → STORM FRONT', 'MINEFIELD → TRIPWIRE GRID'] },
  { name: 'MINEFIELD',    color: '#7dff98', rarity: 'legendary', desc: 'seed faceted charges that burst, pull, and lance threats', synergies: ['MAGNET → GRAVITY MINES', 'INTERFERENCE → SEISMIC FIELD', 'ARC → TRIPWIRE GRID', 'PHASE STEP → PHASE WAKE'] },
  { name: 'LANCE',        color: '#fff06a', rarity: 'rare',      desc: 'periodic heavy piercing rail shot',            synergies: ['LENS → RAIL FOCUS', 'SIPHON → SURGICAL DRAIN'] },
];

// Must stay in index-lock with Rust's EvolutionKind enum (src/shards.rs).
const EVOLUTIONS: EvolutionMeta[] = [
  {
    name: 'AFTERIMAGE ENGINE',
    color: '#ffb547',
    desc: 'dashing leaves firing echoes at your old position',
    recipe: 'ECHO 6 + MOMENTUM 6',
  },
  {
    name: 'WHITEOUT',
    color: '#b9f4ff',
    desc: 'frozen kills burst into freezing rays and longer frost fields',
    recipe: 'FROST 6 + DIFFRACT 6',
  },
  {
    name: 'KALEIDOSCOPE',
    color: '#cc88ff',
    desc: 'every salvo also fires a prismatic great-circle ring of 12 rays',
    recipe: 'SPLIT 6 + MIRROR 6',
  },
  {
    name: 'SINGULARITY',
    color: '#5544ff',
    desc: 'interference rings become gravity wells — enemies spiral inward, ring damage +75%',
    recipe: 'MAGNET 6 + INTERFERENCE 6',
  },
  {
    name: 'SOLAR CROWN',
    color: '#ffec66',
    desc: 'halo contacts recharge your barrier; barrier hits flare all orbitals',
    recipe: 'HALO 6 + BARRIER 6',
  },
];

type RunOutcome = 'VICTORY' | 'DEATH';

interface StoredShard {
  name: string;
  level: number;
}

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
  maxObserved?: {
    enemies: number;
    circles: number;
    beams: number;
  };
  synergies: string[];
  evolutions?: string[];
  topShards: StoredShard[];
}

const BEST_RUNS_STORAGE_KEY = 'prism.bestRuns.v1';
const QUALITY_STORAGE_KEY = 'prism.visualQuality.v1';
const NUMBERS_STORAGE_KEY = 'prism.damageNumbers.v1';
const MAX_STORED_RUNS = 5;

const formatTime = (secondsRaw: number): string => {
  const secondsTotal = Math.max(0, Math.floor(secondsRaw));
  const mins = Math.floor(secondsTotal / 60);
  const secs = secondsTotal % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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

/** Deterministic daily UTC challenge seed via FNV-1a 32-bit hash. */
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

const isStoredShard = (value: unknown): value is StoredShard => {
  if (typeof value !== 'object' || value === null) return false;
  const shard = value as Partial<StoredShard>;
  return typeof shard.name === 'string' && typeof shard.level === 'number';
};

const isStoredRunSummary = (value: unknown): value is StoredRunSummary => {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<StoredRunSummary>;
  return run.version === 1 &&
    (run.outcome === 'VICTORY' || run.outcome === 'DEATH') &&
    typeof run.savedAt === 'string' &&
    typeof run.score === 'number' &&
    typeof run.timeSeconds === 'number' &&
    typeof run.rank === 'number' &&
    typeof run.peakRank === 'number' &&
    typeof run.kills === 'number' &&
    typeof run.bossKills === 'number' &&
    typeof run.damageTaken === 'number' &&
    typeof run.barrierAbsorbed === 'number' &&
    typeof run.gems === 'number' &&
    Array.isArray(run.synergies) &&
    run.synergies.every((s) => typeof s === 'string') &&
    Array.isArray(run.topShards) &&
    run.topShards.every(isStoredShard);
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

const writeStoredRuns = (runs: StoredRunSummary[]): boolean => {
  try {
    window.localStorage.setItem(BEST_RUNS_STORAGE_KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
};

const saveRunSummary = (summary: StoredRunSummary): {
  runs: StoredRunSummary[];
  isNewBest: boolean;
  storageOk: boolean;
} => {
  const previousRuns = readStoredRuns();
  const previousBest = previousRuns[0];
  const isNewBest = !previousBest || compareRuns(summary, previousBest) < 0;
  const runs = [...previousRuns, summary].sort(compareRuns).slice(0, MAX_STORED_RUNS);
  const storageOk = writeStoredRuns(runs);
  return { runs, isNewBest, storageOk };
};

const renderBestRuns = (
  runs: StoredRunSummary[],
  currentSavedAt: string,
  isNewBest: boolean,
  storageOk: boolean,
): string => {
  if (runs.length === 0) return '';
  const lines = runs.map((run, idx) => {
    const currentClass = run.savedAt === currentSavedAt ? ' current-run' : '';
    const shardText = run.topShards.length > 0
      ? ` · ${run.topShards.slice(0, 2).map((s) => `${escapeHtml(s.name)} ${s.level}`).join(', ')}`
      : '';
    return `<div class="best-run-line${currentClass}">` +
      `${idx + 1}. ${run.score} PTS · ${formatTime(run.timeSeconds)} · ${run.outcome}${shardText}` +
      `</div>`;
  }).join('');
  return `<div class="best-run-panel">` +
    `<div class="best-run-title">${isNewBest ? '★ NEW PERSONAL BEST' : 'LOCAL LEADERBOARD'}</div>` +
    lines +
    (storageOk ? '' : `<div class="best-run-line">storage unavailable this session</div>`) +
    `</div>`;
};

const describeDamageSource = (sourceIdx: number): string =>
  DAMAGE_SOURCE_NAMES[sourceIdx] ?? 'UNKNOWN';

const collectDamageBreakdown = (game: Game): string[] =>
  DAMAGE_SOURCE_NAMES
    .map((name, i) => ({ name, amount: Math.round(game.damage_by_source(i)) }))
    .filter((entry) => entry.amount > 0)
    .map((entry) => `${entry.name}: ${entry.amount}`);

const collectRankTimeline = (game: Game): string =>
  Array.from({ length: RANK_TIMELINE_BUCKETS }, (_, i) => `m${i}:${game.rank_at_minute(i)}`)
    .join(', ');

const collectUpgradePickOrder = (game: Game): string[] => {
  const picks: string[] = [];
  const count = game.upgrade_pick_count();
  for (let i = 0; i < count; i++) {
    const offerType = game.upgrade_pick_type(i);
    const offerIdx = game.upgrade_pick_index(i);
    const time = formatTime(game.upgrade_pick_time(i));
    if (offerType === UPGRADE_PICK_SHARD) {
      picks.push(`${time} ${SHARDS[offerIdx]?.name ?? `SHARD ${offerIdx}`}`);
    } else if (offerType === UPGRADE_PICK_EVOLUTION) {
      picks.push(`${time} ${EVOLUTIONS[offerIdx]?.name ?? `EVOLUTION ${offerIdx}`}`);
    } else if (offerType === UPGRADE_PICK_SKIP) {
      picks.push(`${time} SKIP`);
    }
  }
  return picks;
};

const collectSynergyTimes = (game: Game): string[] =>
  SYNERGY_NAMES
    .map((name, i) => ({ name, time: game.synergy_time(i) }))
    .filter((entry) => entry.time >= 0)
    .map((entry) => `${formatTime(entry.time)} ${entry.name}`);

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
  const sysMuteBtn = getEl('sys-mute-btn') as HTMLButtonElement;
  const sysPauseBtn = getEl('sys-pause-btn') as HTMLButtonElement;

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
  const pauseBuildEl = getEl('pause-build');
  const btnResume = getEl('btn-resume') as HTMLButtonElement;
  const btnRestartPause = getEl('btn-restart-pause') as HTMLButtonElement;
  const btnToggleSound = getEl('btn-toggle-sound') as HTMLButtonElement;
  const btnToggleFx = getEl('btn-toggle-fx') as HTMLButtonElement;
  const btnToggleNumbers = getEl('btn-toggle-numbers') as HTMLButtonElement;

  // Boot WASM.
  const wasm = await init();
  const memory: WebAssembly.Memory = wasm.memory;

  // Build synergy tags.
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

  // Build shard tray.
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

  // Restore saved visual quality & damage-numbers preferences.
  try {
    const savedQ = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (savedQ === 'high' || savedQ === 'balanced' || savedQ === 'reduced') {
      renderer.setQuality(savedQ);
    }
    const savedNums = window.localStorage.getItem(NUMBERS_STORAGE_KEY);
    if (savedNums === '0') {
      overlay.setEnabled(false);
    }
  } catch { /* ignore storage errors */ }

  let numbersEnabled = true;
  try {
    numbersEnabled = window.localStorage.getItem(NUMBERS_STORAGE_KEY) !== '0';
  } catch { /* ignore */ }

  const syncSettingsButtons = (): void => {
    const muted = audio.isMuted();
    btnToggleSound.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    sysMuteBtn.textContent = muted ? 'SFX: OFF' : 'SFX: ON';
    const q = renderer.getQuality().toUpperCase();
    btnToggleFx.textContent = `FX: ${q}`;
    btnToggleNumbers.textContent = numbersEnabled ? 'NUMBERS: ON' : 'NUMBERS: OFF';
  };
  syncSettingsButtons();

  // Initialize AudioContext on first user gesture.
  const ensureAudio = (): void => {
    if (!audio.isInitialized()) audio.init();
    audio.resume();
  };
  window.addEventListener('keydown', ensureAudio, { once: true });
  window.addEventListener('pointerdown', ensureAudio, { once: true });

  // DPR-aware sizing.
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

  // Daily seed & URL ?seed= support.
  const daily = getDailySeedInfo();
  btnDaily.textContent = `DAILY · ${daily.dateLabel}`;
  const urlParams = new URLSearchParams(window.location.search);
  const urlSeedRaw = urlParams.get('seed');
  const urlSeed = urlSeedRaw && /^\d+$/.test(urlSeedRaw) ? (Number(urlSeedRaw) >>> 0) : null;
  const autoStart = urlParams.get('autostart') === '1' || urlSeed !== null;

  const updateTitleBestBadge = (): void => {
    const best = readStoredRuns()[0];
    if (best) {
      titleBestEl.textContent =
        `PERSONAL BEST · ${best.score} PTS · ${formatTime(best.timeSeconds)} · RANK ${best.peakRank} (${best.outcome})`;
    } else {
      titleBestEl.textContent = '';
    }
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

  // Attract-mode preview geometry for the Title Screen (spinning prism over live crystal globe).
  const attractCircles = new Float32Array(CIRCLE_STRIDE_FLOATS * 16);
  const attractBeams = new Float32Array(BEAM_AUGMENTED_STRIDE * 6);

  // Zero-copy views into WASM linear memory.
  let circlesPtr = -1;
  let circlesLen = 0;
  let circlesView: Float32Array = new Float32Array(0);
  let beamsPtr = -1;
  let beamsLen = 0;
  let beamsView: Float32Array = new Float32Array(0);
  let popupsPtr = -1;
  let popupsLen = 0;
  let popupsView: Float32Array = new Float32Array(0);

  interface BeamEntry { birth: number; duration: number }
  const beamBirthTimes = new Map<string, BeamEntry>();
  let augBeamBuf = new Float32Array(0);

  const resetWasmViews = (): void => {
    circlesPtr = -1;
    circlesLen = 0;
    beamsPtr = -1;
    beamsLen = 0;
    popupsPtr = -1;
    popupsLen = 0;
    beamBirthTimes.clear();
  };

  const refreshBuffers = (): void => {
    const cPtr = game.circles_ptr();
    const cLen = game.circles_len();
    if (cPtr !== circlesPtr || cLen !== circlesLen || circlesView.buffer !== memory.buffer) {
      circlesPtr = cPtr;
      circlesLen = cLen;
      circlesView = cLen > 0
        ? new Float32Array(memory.buffer, cPtr, cLen * CIRCLE_STRIDE_FLOATS)
        : new Float32Array(0);
    }

    const bPtr = game.beams_ptr();
    const bLen = game.beams_len();
    if (bPtr !== beamsPtr || bLen !== beamsLen || beamsView.buffer !== memory.buffer) {
      beamsPtr = bPtr;
      beamsLen = bLen;
      beamsView = bLen > 0
        ? new Float32Array(memory.buffer, bPtr, bLen * BEAM_STRIDE_FLOATS)
        : new Float32Array(0);
    }

    const pPtr = game.popups_ptr();
    const pLen = game.popups_len();
    if (pPtr !== popupsPtr || pLen !== popupsLen || popupsView.buffer !== memory.buffer) {
      popupsPtr = pPtr;
      popupsLen = pLen;
      popupsView = pLen > 0
        ? new Float32Array(memory.buffer, pPtr, pLen * POPUP_STRIDE_FLOATS)
        : new Float32Array(0);
    }
  };

  // HUD change-detection state.
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
    lastRank = -1;
    lastKills = -1;
    lastScore = -1;
    lastXpPct = -1;
    lastXp = -1;
    lastXpNeeded = -1;
    lastHp = -1;
    lastMaxHp = -1;
    lastHpPct = -1;
    lastDashReady = false;
    lastTimerStr = '';
    lastWave = -1;
    lastBossActive = false;
    lastBossKind = -2;
    lastBossPct = -1;
    lastStreak = -1;
    lastEndless = false;
    lastPipLevels.fill(-1);
    lastActiveBits = -1;
    lastNearBits = -1;
    announcedSynergyBits = 0;
    announcedEvoBits = 0;
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
    audio.duck(false);
    sysBarMidEl.textContent = dailyMode
      ? `DAILY ${daily.dateLabel} · SEED #${currentSeed}`
      : `SPHERICAL ARENA · SEED #${currentSeed}`;
    overlay.announce(dailyMode ? `DAILY ${daily.dateLabel}` : 'REFRACTION ONLINE', '#a8f4ff', 'SURVIVE 15:00 OR SHATTER THE VOID PRISM');
    last = performance.now();
  };

  if (autoStart) {
    titleScreenEl.classList.remove('shown');
    hudEl.classList.remove('hidden');
    sysBarMidEl.textContent = `SPHERICAL ARENA · SEED #${currentSeed}`;
  }

  btnPlay.addEventListener('click', () => {
    const freshSeed = (Math.random() * 0xffffffff) >>> 0;
    startNewRun(freshSeed, false);
  });
  btnDaily.addEventListener('click', () => {
    startNewRun(daily.seed, true);
  });

  // --- Pause Menu + Active Build Inspector -------------------------------

  const renderPauseBuild = (): void => {
    const owned = SHARDS.map((s, i) => ({
      name: s.name,
      color: s.color,
      lvl: game.inventory_level(i),
    })).filter((s) => s.lvl > 0);
    const activeSyn = SYNERGY_NAMES.filter((_, i) => ((game.active_synergy_bits() >>> i) & 1) === 1);
    const activeEvo = EVOLUTIONS
      .filter((_, i) => ((game.active_evolution_bits() >>> i) & 1) === 1)
      .map((e) => e.name);
    const elapsed = Math.max(1, game.timer());
    const dps = game.total_damage_dealt() / elapsed;

    const shardChips = owned.length > 0
      ? owned.map((s) => `<span class="build-chip" style="border-color:${s.color}66;color:${s.color}">${s.name} L${s.lvl}</span>`).join('')
      : '<span style="opacity:0.5">No shards collected yet</span>';
    const synLine = activeSyn.length > 0
      ? `<div style="margin-top:8px;color:#ffd740">SYNERGIES: ${activeSyn.map(escapeHtml).join(' · ')}</div>`
      : '';
    const evoLine = activeEvo.length > 0
      ? `<div style="margin-top:4px;color:#ffb547">EVOLUTIONS: ${activeEvo.map(escapeHtml).join(' · ')}</div>`
      : '';

    pauseBuildEl.innerHTML =
      `<div style="display:flex;justify-content:space-between;color:#dcf8ff">` +
        `<span>BUILD INSPECTOR · SEED #${game.seed()}${isDailyRun ? ' (DAILY)' : ''}</span>` +
        `<span>${formatCompact(dps)} DPS · PEAK ×${game.peak_kill_streak()}</span>` +
      `</div>` +
      `<div class="build-chip-row">${shardChips}</div>` +
      synLine +
      evoLine;
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
  };

  btnResume.addEventListener('click', togglePause);
  sysPauseBtn.addEventListener('click', togglePause);
  btnRestartPause.addEventListener('click', () => {
    startNewRun((Math.random() * 0xffffffff) >>> 0, false);
  });

  const handleToggleMute = (): void => {
    ensureAudio();
    audio.toggleMute();
    syncSettingsButtons();
  };
  btnToggleSound.addEventListener('click', handleToggleMute);
  sysMuteBtn.addEventListener('click', handleToggleMute);

  btnToggleFx.addEventListener('click', () => {
    const order: VisualQuality[] = ['high', 'balanced', 'reduced'];
    const cur = renderer.getQuality();
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
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

  // --- Level-up modal ----------------------------------------------------

  const updateModalFocusVisual = (): void => {
    const cards = levelupCardsEl.querySelectorAll<HTMLButtonElement>('.shard-card');
    cards.forEach((c, idx) => {
      c.classList.toggle('gamepad-focus', idx === modalFocusIdx);
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
      card.dataset.slot = String(slot);

      if (offerType === 1) {
        if (offerIdx >= EVOLUTIONS.length) continue;
        const meta = EVOLUTIONS[offerIdx]!;
        card.style.borderColor = 'rgba(255,181,71,0.58)';
        card.style.boxShadow = '0 0 28px rgba(255,181,71,0.16)';
        card.innerHTML =
          `<div class="shard-rarity evolution">★ evolution</div>` +
          `<div class="shard-icon" style="background:${meta.color};color:${meta.color}"></div>` +
          `<div class="shard-name">${meta.name}</div>` +
          `<div class="shard-level">${meta.recipe}</div>` +
          `<div class="shard-desc">${meta.desc}</div>` +
          `<div class="shard-hotkey">[${slot + 1}]</div>`;
      } else {
        if (offerIdx >= SHARDS.length) continue;
        const meta = SHARDS[offerIdx]!;
        const currentLevel = game.inventory_level(offerIdx);
        const nextLevel = currentLevel + 1;
        if (meta.rarity === 'rare') card.style.borderColor = 'rgba(127,211,255,0.34)';
        if (meta.rarity === 'legendary') card.style.borderColor = 'rgba(255,215,64,0.45)';

        const pipLadder = Array.from({ length: 6 }, (_, n) => {
          const lvl = n + 1;
          let bg: string, shadow = 'none', border = '1px solid transparent', opacity = '1';
          if (lvl <= currentLevel) {
            bg = meta.color;
          } else if (lvl === nextLevel) {
            bg = 'rgba(255,255,255,0.92)';
            shadow = '0 0 6px rgba(255,255,255,0.85)';
            border = '1px solid rgba(255,255,255,0.65)';
          } else {
            bg = 'transparent';
            opacity = '0.22';
          }
          return `<div style="flex:1;height:4px;background:${bg};box-shadow:${shadow};border:${border};opacity:${opacity}"></div>`;
        }).join('');

        const synergyHtml = meta.synergies.length > 0
          ? `<div class="shard-synergy">${meta.synergies.map((s) => `<span>${s}</span>`).join('')}</div>`
          : '';

        card.innerHTML =
          `<div class="shard-rarity ${meta.rarity}">${meta.rarity}</div>` +
          `<div class="shard-icon" style="background:${meta.color};color:${meta.color}"></div>` +
          `<div class="shard-name">${meta.name}</div>` +
          `<div style="display:flex;gap:3px;margin:6px 0 2px">${pipLadder}</div>` +
          `<div class="shard-level">LV ${currentLevel} → ${nextLevel}</div>` +
          `<div class="shard-desc">${meta.desc}</div>` +
          synergyHtml +
          `<div class="shard-hotkey">[${slot + 1}]</div>`;
      }
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
    rerollBtn.className = 'levelup-action';
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
    skipBtn.className = 'levelup-action';
    skipBtn.type = 'button';
    skipBtn.textContent = 'SKIP [X / B]  +6 HP';
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
  };

  const hideLevelUpModal = (): void => {
    levelupEl.classList.remove('shown');
    levelupCardsEl.innerHTML = '';
    levelupFooterEl.innerHTML = '';
    audio.duck(false);
    modalShown = false;
  };

  // --- Death / Victory screen --------------------------------------------

  const ENEMY_KIND_NAMES = ['DRONE', 'BRUTE', 'DASHER', 'SPLITTER', 'ORBITER', 'EMITTER', 'PULSAR', 'UMBRA'];

  const showDeathScreen = (victory: boolean): void => {
    if (victory) {
      deathTitleEl.textContent = 'VICTORY';
      deathTitleEl.classList.add('victory-title');
      btnContinueEndless.classList.add('shown');
    } else {
      deathTitleEl.textContent = game.is_endless() ? 'ENDLESS SHATTERED' : 'SHATTERED';
      deathTitleEl.classList.remove('victory-title');
      btnContinueEndless.classList.remove('shown');
    }
    deathScoreEl.textContent = `${game.score()} PTS`;

    const t = game.timer();
    const timeStr = formatTime(t);
    const dmgTaken = Math.round(game.damage_taken());
    const barrierAbs = Math.round(game.barrier_absorbed());
    const gems = game.gems_collected();
    const bossKills = game.boss_kills_count();
    const peakStreak = game.peak_kill_streak();
    const avgDps = game.total_damage_dealt() / Math.max(1, t);
    const deathCauseIdx = game.death_cause();
    const deathCause = !victory && deathCauseIdx >= 0
      ? describeDamageSource(deathCauseIdx)
      : undefined;
    const damageBreakdown = collectDamageBreakdown(game);
    const rankTimeline = collectRankTimeline(game);
    const upgradePickOrder = collectUpgradePickOrder(game);
    const synergyTimes = collectSynergyTimes(game);
    const maxObserved = {
      enemies: game.max_enemies_observed(),
      circles: game.max_circles_observed(),
      beams: game.max_beams_observed(),
    };
    const activeSynergies = SYNERGY_NAMES.filter((_, i) => ((game.active_synergy_bits() >>> i) & 1) === 1);
    const activeEvolutions = EVOLUTIONS
      .filter((_, i) => ((game.active_evolution_bits() >>> i) & 1) === 1)
      .map((e) => e.name);
    const topShards: StoredShard[] = SHARDS.map((s, i) => ({
      name: s.name,
      level: game.inventory_level(i),
    }))
      .filter((s) => s.level > 0)
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
      .slice(0, 5);

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
      gems,
      skips: game.skip_count(),
      rerolls: game.reroll_count(),
      maxObserved,
      synergies: activeSynergies,
      evolutions: activeEvolutions,
      topShards,
    };
    const { runs, isNewBest, storageOk } = saveRunSummary(summary);
    updateTitleBestBadge();

    const shardSummary = SHARDS.map((s, i) => {
      const lvl = game.inventory_level(i);
      return lvl > 0 ? `<span class="build-chip" style="border-color:${s.color}55;color:${s.color}">${s.name} L${lvl}</span>` : null;
    }).filter(Boolean).join('');

    const synergySummary = activeSynergies.length > 0
      ? `<div style="margin-top:6px;color:#ffd740">SYNERGIES · ${activeSynergies.map(escapeHtml).join(' / ')}</div>`
      : '';
    const evolutionSummary = activeEvolutions.length > 0
      ? `<div style="margin-top:4px;color:#ffb547">EVOLUTIONS · ${activeEvolutions.map(escapeHtml).join(' / ')}</div>`
      : '';
    const deathCauseSummary = deathCause
      ? `<div style="color:#ff8f8f;margin-bottom:4px">CAUSE · ${escapeHtml(deathCause)}${damageBreakdown.length > 0 ? ` (${escapeHtml(damageBreakdown.join(' · '))})` : ''}</div>`
      : '';

    deathStatsEl.innerHTML =
      deathCauseSummary +
      `<div class="stat-grid">` +
        `<div class="stat-cell"><div class="stat-cell-label">SURVIVED</div><div class="stat-cell-val">${timeStr}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">RANK</div><div class="stat-cell-val">${game.rank()}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">KILLS</div><div class="stat-cell-val">${game.kills_total()}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">PEAK STREAK</div><div class="stat-cell-val">×${peakStreak}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">AVG DPS</div><div class="stat-cell-val">${formatCompact(avgDps)}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">BOSSES</div><div class="stat-cell-val">${bossKills}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">DMG / SHIELD</div><div class="stat-cell-val">${dmgTaken} / ${barrierAbs}</div></div>` +
        `<div class="stat-cell"><div class="stat-cell-label">SEED</div><div class="stat-cell-val">#${game.seed()}</div></div>` +
      `</div>` +
      synergySummary +
      evolutionSummary +
      (shardSummary ? `<div class="build-chip-row" style="justify-content:center;margin-top:8px">${shardSummary}</div>` : '') +
      renderBestRuns(runs, summary.savedAt, isNewBest, storageOk);

    deathScreenEl.classList.add('shown');
    deathShown = true;
    btnCopyTelemetry.textContent = 'COPY SEED';
    if (victory) audio.playVictory();
    else audio.playDeath();

    const killsByKind = ENEMY_KIND_NAMES.map((n, i) => `${n}: ${game.kills_by_kind(i)}`).join(', ');
    const shardSummaryText = SHARDS.map((s, i) => {
      const lvl = game.inventory_level(i);
      return lvl > 0 ? `${s.name} ${lvl}` : null;
    }).filter(Boolean).join(', ');

    lastRunTelemetryText =
      `PRISM ${victory ? 'VICTORY' : 'RUN'} | Seed #${game.seed()}${isDailyRun ? ` (Daily ${daily.dateLabel})` : ''}\n` +
      `Score: ${game.score()} | Time: ${timeStr} | Rank: ${game.rank()} | Kills: ${game.kills_total()} (Peak ×${peakStreak})\n` +
      `Avg DPS: ${Math.round(avgDps)} | Bosses: ${bossKills} | Shards: ${shardSummaryText || 'none'}\n` +
      `Synergies: ${activeSynergies.join(', ') || 'none'} | Evolutions: ${activeEvolutions.join(', ') || 'none'}`;

    console.log(
      `[PRISM RUN SUMMARY]\n` +
      `  seed: ${game.seed()}\n` +
      `  outcome: ${victory ? 'VICTORY' : 'DEATH'}  |  time: ${timeStr}  |  score: ${game.score()}\n` +
      `  death cause: ${deathCause ?? 'none'}\n` +
      `  rank: ${game.rank()} (peak ${game.peak_rank()})  |  kills: ${game.kills_total()} (peak streak ${peakStreak})  |  bosses: ${bossKills}\n` +
      `  avg dps: ${Math.round(avgDps)}  |  dmg taken: ${dmgTaken}  |  barrier absorbed: ${barrierAbs}  |  gems: ${gems}\n` +
      `  damage by source: ${damageBreakdown.join(', ') || 'none'}\n` +
      `  kills by kind: ${killsByKind}\n` +
      `  rank timeline: ${rankTimeline}\n` +
      `  shard picks: ${upgradePickOrder.join(' -> ') || 'none'}\n` +
      `  skips/rerolls: ${game.skip_count()} / ${game.reroll_count()}\n` +
      `  synergies: ${activeSynergies.join(', ') || 'none'}\n` +
      `  synergy times: ${synergyTimes.join(', ') || 'none'}\n` +
      `  evolutions: ${activeEvolutions.join(', ') || 'none'}\n` +
      `  max observed: enemies ${maxObserved.enemies}, circles ${maxObserved.circles}, beams ${maxObserved.beams}\n` +
      `  shards: ${shardSummaryText || 'none'}`,
    );
  };

  const hideDeathScreen = (): void => {
    deathScreenEl.classList.remove('shown');
    deathShown = false;
    resetHudCache();
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
    overlay.announce('ENDLESS OVERDRIVE', '#ffd740', 'ESCALATING WAVES & OVERDRIVE BOSSES');
    last = performance.now();
  });

  btnCopyTelemetry.addEventListener('click', () => {
    if (!lastRunTelemetryText) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(lastRunTelemetryText).then(() => {
        btnCopyTelemetry.textContent = 'COPIED!';
      });
    }
  });

  deathRestartEl.addEventListener('click', doRestart);

  // Global keyboard shortcuts.
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

  // --- Main RAF loop -----------------------------------------------------

  let last = performance.now();
  let fpsLast = last;
  let fpsFrames = 0;
  let lastGamepadShown = false;

  const frame = (now: number): void => {
    const rawDt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    // Poll Gamepad API every frame (works on title, active run, level-up modal, and pause!).
    input.pollGamepad(modalShown);
    const padNow = input.hasGamepad();
    if (padNow !== lastGamepadShown) {
      sysUplinkEl.textContent = padNow ? '● GAMEPAD READY' : '● UPLINK STABLE';
      lastGamepadShown = padNow;
    }
    if (input.consumePause()) {
      if (!isStarted) {
        startNewRun((Math.random() * 0xffffffff) >>> 0, false);
      } else {
        togglePause();
      }
    }

    // Attract-mode spinning crystal globe on Title Screen!
    if (!isStarted) {
      const t = now / 1000;
      const camX = t * 52;
      const camY = Math.sin(t * 0.24) * 190;
      // Central prism + orbiting spectral crystal ring + refracting preview beams.
      let cIdx = 0;
      const putCircle = (
        x: number, y: number, r: number,
        cr: number, cg: number, cb: number, ca: number, glow: number, shape: number,
      ): void => {
        const o = cIdx * CIRCLE_STRIDE_FLOATS;
        attractCircles[o] = x;
        attractCircles[o + 1] = y;
        attractCircles[o + 2] = r;
        attractCircles[o + 3] = cr;
        attractCircles[o + 4] = cg;
        attractCircles[o + 5] = cb;
        attractCircles[o + 6] = ca;
        attractCircles[o + 7] = glow;
        attractCircles[o + 8] = shape;
        cIdx++;
      };

      putCircle(camX, camY, 64, 0.35, 0.85, 1.0, 0.34, 1.6, 4.0);
      putCircle(camX, camY, 26, 0.74, 0.96, 1.0, 0.96, 1.5, 5.0);
      for (let i = 0; i < 6; i++) {
        const a = t * 0.55 + (i * Math.PI * 2) / 6;
        const ox = camX + Math.cos(a) * 140;
        const oy = camY + Math.sin(a) * 140;
        const hue = i / 6;
        const cr = 0.5 + 0.5 * Math.cos(hue * Math.PI * 2);
        const cg = 0.5 + 0.5 * Math.cos(hue * Math.PI * 2 + 2.094);
        const cb = 0.5 + 0.5 * Math.cos(hue * Math.PI * 2 + 4.189);
        putCircle(ox, oy, 12, cr, cg, cb, 0.90, 2.0, 1.0);

        const bo = i * BEAM_AUGMENTED_STRIDE;
        attractBeams[bo] = camX;
        attractBeams[bo + 1] = camY;
        attractBeams[bo + 2] = camX + Math.cos(a) * 420;
        attractBeams[bo + 3] = camY + Math.sin(a) * 420;
        attractBeams[bo + 4] = 2.0;
        attractBeams[bo + 5] = cr;
        attractBeams[bo + 6] = cg;
        attractBeams[bo + 7] = cb;
        attractBeams[bo + 8] = 0.55;
        attractBeams[bo + 9] = 2.1;
        attractBeams[bo + 10] = 1.0;
      }

      renderer.render(
        pixelW, pixelH, viewW, viewH,
        [camX, camY],
        attractCircles, cIdx,
        attractBeams, 6,
        [0, 0],
        t,
        game.arena_radius(),
        { intensity: 0.45, screenFlash: 0, damageFlash: 0, lowHp: 0, bossMood: 0 },
      );
      requestAnimationFrame(frame);
      return;
    }

    if (isPaused) {
      requestAnimationFrame(frame);
      return;
    }

    // Handle Gamepad navigation inside Level-Up modal.
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

    // Visceral micro hit-stop time dilation (purely presentation-side; deterministic Rust unaffected).
    let simDt = rawDt;
    if (hitStopTimer > 0) {
      hitStopTimer = Math.max(0, hitStopTimer - rawDt);
      simDt = rawDt * 0.22;
    }

    const [ix, iy] = input.direction();
    game.set_input(ix, iy);
    game.set_dash_input(input.consumeDash());
    game.update(simDt);

    const pulseHitStop = game.hit_stop_pulse();
    if (pulseHitStop > 0.1) {
      hitStopTimer = Math.max(hitStopTimer, 0.025 + pulseHitStop * 0.03);
    }

    // Compute build intensity (0..1).
    let totalShardLevels = 0;
    for (let i = 0; i < SHARDS.length; i++) {
      totalShardLevels += game.inventory_level(i);
    }
    const intensity = Math.min(1.0, totalShardLevels / 40.0);
    const bossActive = game.boss_active();
    const eventBits = game.audio_event_bits();
    const activeBits = game.active_synergy_bits();
    const activeEvoBits = game.active_evolution_bits();
    const streak = game.kill_streak();

    // Audio DSP tick.
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
      );
    }

    // Floating milestone announcements on Overlay Canvas.
    if (eventBits & AUDIO_BOSS_SPAWN) {
      const bName = BOSS_NAMES[game.boss_kind_index()] ?? 'ANCIENT PRISM';
      overlay.announce(`WARNING · ${bName}`, '#ffad5c', 'ARENA CROWD CLEARED FOR ENGAGEMENT');
    }
    if (eventBits & AUDIO_SHIELD_BREAK) {
      overlay.announce('SHIELD SHATTERED', '#ffe26a', 'SENTINEL CORE EXPOSED');
    }
    if (eventBits & AUDIO_STREAK_MILESTONE) {
      overlay.announce(`×${streak} KILL STREAK`, streak >= 100 ? '#ff8df2' : '#ffd740');
    }
    const newSynergies = activeBits & ~announcedSynergyBits;
    if (newSynergies !== 0) {
      for (let i = 0; i < SYNERGY_NAMES.length; i++) {
        if ((newSynergies >>> i) & 1) {
          overlay.announce(`⚡ SYNERGY · ${SYNERGY_NAMES[i]}`, '#ffd740');
        }
      }
      announcedSynergyBits = activeBits;
    }
    const newEvos = activeEvoBits & ~announcedEvoBits;
    if ((eventBits & AUDIO_EVOLUTION) || newEvos !== 0) {
      for (let i = 0; i < EVOLUTIONS.length; i++) {
        if ((newEvos >>> i) & 1) {
          overlay.announce(`★ EVOLUTION · ${EVOLUTIONS[i]!.name}`, EVOLUTIONS[i]!.color, EVOLUTIONS[i]!.desc.toUpperCase());
        }
      }
      announcedEvoBits = activeEvoBits;
    }

    // Death / victory screen edges.
    const isDead = game.is_dead();
    const isVictory = game.is_victory();
    if (isDead && !deathShown) showDeathScreen(isVictory);

    // Dash cooldown indicator.
    const dashPct = game.dash_cooldown_pct();
    dashFillEl.style.width = ((1 - dashPct) * 100) + '%';

    // Wave clear banner.
    if (game.wave_clear_timer() > 0) waveClearEl.classList.add('shown');
    else waveClearEl.classList.remove('shown');

    // Modal open/close by state edges.
    const isLeveling = game.is_leveling_up();
    if (isLeveling && !modalShown) showLevelUpModal();
    if (!isLeveling && modalShown) hideLevelUpModal();

    // HUD updates (change-detected).
    const rank = game.rank();
    if (rank !== lastRank) {
      rankEl.textContent = String(rank);
      lastRank = rank;
    }
    const kills = game.kills_total();
    const score = game.score();
    if (kills !== lastKills || score !== lastScore) {
      killsEl.textContent = `${kills} KILLS · ${score} PTS`;
      lastKills = kills;
      lastScore = score;
    }
    // Kill-streak combo badge.
    if (streak !== lastStreak) {
      comboWrapEl.classList.toggle('shown', streak >= 3);
      if (streak >= 3) {
        comboValEl.textContent = `×${streak} STREAK`;
        comboValEl.classList.toggle('hot', streak >= 25 && streak < 75);
        comboValEl.classList.toggle('super', streak >= 75);
      }
      lastStreak = streak;
    }
    if (streak >= 3) {
      comboFillEl.style.width = (game.kill_streak_timer_pct() * 100) + '%';
    }

    const xp = game.xp();
    const xpNeeded = game.xp_needed();
    const xpPct = xpNeeded > 0 ? Math.round(Math.min(100, (xp / xpNeeded) * 100)) : 0;
    if (xpPct !== lastXpPct) {
      if (xpPct < lastXpPct) xpFillEl.style.transition = 'none';
      else xpFillEl.style.transition = '';
      xpFillEl.style.width = xpPct + '%';
      lastXpPct = xpPct;
    }
    if (xp !== lastXp || xpNeeded !== lastXpNeeded) {
      xpRankLabelEl.textContent = `RADIANCE TO RANK ${rank + 1}`;
      xpValEl.textContent = `${xp} / ${xpNeeded}`;
      lastXp = xp;
      lastXpNeeded = xpNeeded;
    }

    const hp = game.hp();
    const maxHp = game.max_hp();
    const hpPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 100;
    if (hp !== lastHp || maxHp !== lastMaxHp) {
      hpValEl.textContent = `${Math.ceil(hp)} / ${Math.round(maxHp)}`;
      lastHp = hp;
      lastMaxHp = maxHp;
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

    const t = game.timer();
    const timerStr = formatTime(t);
    if (timerStr !== lastTimerStr) {
      timerEl.textContent = timerStr;
      lastTimerStr = timerStr;
    }

    const wave = game.wave();
    if (wave !== lastWave) {
      waveLabelEl.textContent = `WAVE ${wave + 1}`;
      lastWave = wave;
    }

    const endlessNow = game.is_endless();
    if (endlessNow !== lastEndless) {
      endlessBadgeEl.classList.toggle('shown', endlessNow);
      lastEndless = endlessNow;
    }

    if (bossActive !== lastBossActive) {
      bossHudEl.classList.toggle('shown', bossActive);
      lastBossActive = bossActive;
      lastBossPct = -1;
      lastBossKind = -2;
    }
    let bossLabel = 'PRISM BOSS';
    if (bossActive) {
      const bossKind = game.boss_kind_index();
      bossLabel = BOSS_NAMES[bossKind] ?? 'UNKNOWN PRISM';
      if (bossKind !== lastBossKind) {
        bossNameEl.textContent = bossLabel;
        lastBossKind = bossKind;
      }
      const bossPct = Math.max(0, Math.min(100, Math.round(game.boss_hp_pct() * 100)));
      if (bossPct !== lastBossPct) {
        bossFillEl.style.width = bossPct + '%';
        lastBossPct = bossPct;
      }
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
        if (isActive) {
          tag.style.display = '';
          tag.className = 'synergy-tag active';
        } else if (isNear) {
          tag.style.display = '';
          tag.className = 'synergy-tag near';
        } else {
          tag.style.display = 'none';
          tag.className = 'synergy-tag';
        }
      }
      lastActiveBits = activeBits;
      lastNearBits = nearBits;
    }

    // Refresh zero-copy WASM views after update().
    refreshBuffers();

    // Build augmented beam buffer with smooth growth formation animation.
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

        const p1x = beamsView[src + 2]!;
        const p1y = beamsView[src + 3]!;
        const cr = beamsView[src + 5]!;
        const key = `${Math.round(p1x * 0.25)},${Math.round(p1y * 0.25)},${Math.round(cr * 8)}`;
        keysThisFrame.add(key);

        let entry = beamBirthTimes.get(key);
        if (!entry) {
          entry = { birth: now, duration: 28 + Math.random() * 52 };
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
      pixelW, pixelH,
      viewW, viewH,
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

    // 2D Overlay pass: floating damage numbers, banners, and off-screen boss chevron.
    overlay.ingestPopups(popupsView, popupsLen);
    overlay.render(
      rawDt,
      camX, camY,
      shakeX, shakeY,
      arenaR,
      bossActive,
      game.boss_world_x(),
      game.boss_world_y(),
      bossLabel,
    );

    // FPS telemetry readout.
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
