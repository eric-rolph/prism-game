// Bootstrap for step 2+3 — wires WASM ↔ Renderer ↔ Input, drives the RAF loop,
// and manages the HUD (rank / kills / XP bar / shard tray) plus the level-up
// modal. The modal is pure DOM over a blurred live canvas; Rust pauses the
// simulation whenever `is_leveling_up()` is true, so the frozen scene stays
// visible through the backdrop filter.

import init, { Game } from '../wasm/prism.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';

const CIRCLE_STRIDE_FLOATS = 8;
const BEAM_STRIDE_FLOATS = 10;

// Must stay in index-lock with Rust's ShardKind enum (src/shards.rs).
interface ShardMeta { name: string; color: string; desc: string }
const SHARDS: ShardMeta[] = [
  { name: 'SPLIT',        color: '#8effa3', desc: 'fan out more beams per volley' },
  { name: 'REFRACT',      color: '#7fd3ff', desc: 'beams curve toward nearest enemy' },
  { name: 'MIRROR',       color: '#c9a3ff', desc: 'fire in every direction' },
  { name: 'CHROMATIC',    color: '#ffa3c9', desc: 'split into red / green / blue' },
  { name: 'LENS',         color: '#ffe58e', desc: 'thicker, heavier beams' },
  { name: 'DIFFRACT',     color: '#8efff4', desc: 'hits scatter into radial bursts' },
  { name: 'ECHO',         color: '#ff9d6c', desc: 'second salvo after a short delay' },
  { name: 'HALO',         color: '#f5f5bc', desc: 'orbital beads strike on contact' },
  { name: 'CASCADE',      color: '#ff6f91', desc: 'kills fork into secondary beams' },
  { name: 'INTERFERENCE', color: '#9a9dff', desc: 'standing-wave pulses ripple outward' },
];

async function main(): Promise<void> {
  // Narrow each DOM node through an intermediate variable so TS preserves the
  // non-null guarantee inside closures (the fix from step 1).
  const canvasEl = document.getElementById('canvas');
  if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('missing #canvas');
  const canvas: HTMLCanvasElement = canvasEl;

  const statusRaw = document.getElementById('status');
  const rankRaw = document.getElementById('rank');
  const killsRaw = document.getElementById('kills');
  const xpFillRaw = document.getElementById('xp-fill');
  const trayRaw = document.getElementById('shards-tray');
  const levelupRaw = document.getElementById('levelup');
  const levelupRankRaw = document.getElementById('levelup-rank');
  const levelupCardsRaw = document.getElementById('levelup-cards');

  if (!statusRaw || !rankRaw || !killsRaw || !xpFillRaw || !trayRaw ||
      !levelupRaw || !levelupRankRaw || !levelupCardsRaw) {
    throw new Error('HUD elements missing from index.html');
  }
  const statusEl: HTMLElement = statusRaw;
  const rankEl: HTMLElement = rankRaw;
  const killsEl: HTMLElement = killsRaw;
  const xpFillEl: HTMLElement = xpFillRaw;
  const trayEl: HTMLElement = trayRaw;
  const levelupEl: HTMLElement = levelupRaw;
  const levelupRankEl: HTMLElement = levelupRankRaw;
  const levelupCardsEl: HTMLElement = levelupCardsRaw;

  // Death screen elements.
  const deathScreenRaw = document.getElementById('death-screen');
  const deathScoreRaw = document.getElementById('death-score');
  const deathStatsRaw = document.getElementById('death-stats');
  const deathRestartRaw = document.getElementById('death-restart');
  const hpFillRaw = document.getElementById('hp-fill');

  if (!deathScreenRaw || !deathScoreRaw || !deathStatsRaw || !deathRestartRaw || !hpFillRaw) {
    throw new Error('Death-screen or HP elements missing from index.html');
  }
  const deathScreenEl: HTMLElement = deathScreenRaw;
  const deathScoreEl: HTMLElement = deathScoreRaw;
  const deathStatsEl: HTMLElement = deathStatsRaw;
  const deathRestartEl: HTMLElement = deathRestartRaw;
  const hpFillEl: HTMLElement = hpFillRaw;

  // Boot WASM. `wasm.memory.buffer` is the ArrayBuffer we re-view as typed
  // arrays every frame — it can grow, so we must check for buffer identity.
  const wasm = await init();
  const memory: WebAssembly.Memory = wasm.memory;

  // Build the shard tray — 10 pips, one per shard. Filled in as levels rise.
  trayEl.innerHTML = '';
  const pips: HTMLElement[] = [];
  for (let i = 0; i < 10; i++) {
    const pip = document.createElement('div');
    pip.className = 'shard-pip';
    pip.dataset['level'] = '0';
    pip.title = SHARDS[i]!.name;
    trayEl.appendChild(pip);
    pips.push(pip);
  }

  const renderer = new Renderer(canvas);
  const input = new Input(canvas);

  // Canvas sizing — DPR-aware, capped at 2× so phones don't burn fill rate.
  // We track viewW/H (CSS pixels, = world units) and pixelW/H (backbuffer)
  // separately; the renderer uses them independently.
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
  };
  applySize();

  const seed = (Math.random() * 0xffffffff) >>> 0;
  const game = new Game(viewW, viewH, seed);

  // Attach resize AFTER game exists, so the listener can't fire during TDZ.
  window.addEventListener('resize', () => {
    applySize();
    game.resize(viewW, viewH);
  });

  statusEl.textContent = 'prism';

  // Zero-copy views into the WASM instance buffers. Rust's `Vec` may
  // reallocate on grow, and `wasm.memory` may grow its buffer — either
  // invalidates the view, so we recheck pointer/length/buffer-identity.
  let circlesPtr = -1;
  let circlesLen = 0;
  let circlesView: Float32Array = new Float32Array(0);
  let beamsPtr = -1;
  let beamsLen = 0;
  let beamsView: Float32Array = new Float32Array(0);

  const refreshCircles = (): void => {
    const ptr = game.circles_ptr();
    const len = game.circles_len();
    if (ptr !== circlesPtr || len !== circlesLen || circlesView.buffer !== memory.buffer) {
      circlesPtr = ptr;
      circlesLen = len;
      circlesView = len > 0
        ? new Float32Array(memory.buffer, ptr, len * CIRCLE_STRIDE_FLOATS)
        : new Float32Array(0);
    }
  };
  const refreshBeams = (): void => {
    const ptr = game.beams_ptr();
    const len = game.beams_len();
    if (ptr !== beamsPtr || len !== beamsLen || beamsView.buffer !== memory.buffer) {
      beamsPtr = ptr;
      beamsLen = len;
      beamsView = len > 0
        ? new Float32Array(memory.buffer, ptr, len * BEAM_STRIDE_FLOATS)
        : new Float32Array(0);
    }
  };

  // HUD change-detection — avoids layout thrash when values are unchanged.
  let lastRank = -1;
  let lastKills = -1;
  let lastXpPct = -1;
  let lastHpPct = -1;
  const lastPipLevels: number[] = new Array(10).fill(-1);

  // --- Level-up modal ----------------------------------------------------

  let modalShown = false;

  const showLevelUpModal = (): void => {
    levelupRankEl.textContent = 'RANK ' + game.rank();
    levelupCardsEl.innerHTML = '';

    for (let slot = 0; slot < 3; slot++) {
      const kindIdx = game.level_choice(slot);
      if (kindIdx < 0 || kindIdx >= SHARDS.length) continue;
      const meta = SHARDS[kindIdx]!;
      const currentLevel = game.inventory_level(kindIdx);
      const nextLevel = currentLevel + 1;

      const card = document.createElement('button');
      card.className = 'shard-card';
      card.type = 'button';
      card.innerHTML =
        `<div class="shard-icon" style="background:${meta.color};color:${meta.color}"></div>` +
        `<div class="shard-name">${meta.name}</div>` +
        `<div class="shard-level">LVL ${currentLevel} → ${nextLevel}</div>` +
        `<div class="shard-desc">${meta.desc}</div>` +
        `<div class="shard-hotkey">${slot + 1}</div>`;
      // `slot` captured per-card via the const.
      card.addEventListener('click', () => {
        game.select_shard(slot);
      });
      levelupCardsEl.appendChild(card);
    }

    levelupEl.classList.add('shown');
    modalShown = true;
  };

  const hideLevelUpModal = (): void => {
    levelupEl.classList.remove('shown');
    levelupCardsEl.innerHTML = '';
    modalShown = false;
  };

  window.addEventListener('keydown', (e) => {
    if (!modalShown) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 3) {
      game.select_shard(n - 1);
      e.preventDefault();
    }
  });

  // --- Death screen ------------------------------------------------------

  let deathShown = false;

  const showDeathScreen = (): void => {
    deathScoreEl.textContent = String(game.score());
    deathStatsEl.innerHTML =
      `RANK ${game.rank()}<br>${game.kills_total()} KILLS`;
    deathScreenEl.classList.add('shown');
    deathShown = true;
  };

  const hideDeathScreen = (): void => {
    deathScreenEl.classList.remove('shown');
    deathShown = false;
    // Reset HUD change-detection so everything redraws.
    lastRank = -1;
    lastKills = -1;
    lastXpPct = -1;
    lastHpPct = -1;
    lastPipLevels.fill(-1);
  };

  const doRestart = (): void => {
    if (!deathShown) return;
    game.restart();
    hideDeathScreen();
  };

  deathRestartEl.addEventListener('click', doRestart);
  window.addEventListener('keydown', (e) => {
    if (deathShown && (e.key === ' ' || e.key === 'Enter')) {
      doRestart();
      e.preventDefault();
    }
  });
  // Tap-to-restart on touch devices.
  deathScreenEl.addEventListener('touchstart', (e) => {
    if (deathShown) {
      doRestart();
      e.preventDefault();
    }
  }, { passive: false });

  // --- Main loop ---------------------------------------------------------

  let last = performance.now();
  let fpsLast = last;
  let fpsFrames = 0;

  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    const [ix, iy] = input.direction();
    game.set_input(ix, iy);
    game.update(dt);

    // Death screen edges.
    const isDead = game.is_dead();
    if (isDead && !deathShown) showDeathScreen();

    // Modal open/close by state edges.
    const isLeveling = game.is_leveling_up();
    if (isLeveling && !modalShown) showLevelUpModal();
    if (!isLeveling && modalShown) hideLevelUpModal();

    // HUD updates only on change.
    const rank = game.rank();
    if (rank !== lastRank) {
      rankEl.textContent = 'rank ' + rank;
      lastRank = rank;
    }
    const kills = game.kills_total();
    if (kills !== lastKills) {
      killsEl.textContent = kills + ' kills';
      lastKills = kills;
    }
    const xp = game.xp();
    const xpNeeded = game.xp_needed();
    const xpPct = xpNeeded > 0
      ? Math.round(Math.min(100, (xp / xpNeeded) * 100))
      : 0;
    if (xpPct !== lastXpPct) {
      xpFillEl.style.width = xpPct + '%';
      lastXpPct = xpPct;
    }
    // HP bar.
    const hp = game.hp();
    const maxHp = game.max_hp();
    const hpPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 100;
    if (hpPct !== lastHpPct) {
      hpFillEl.style.width = hpPct + '%';
      lastHpPct = hpPct;
    }
    for (let i = 0; i < 10; i++) {
      const lvl = game.inventory_level(i);
      if (lvl !== lastPipLevels[i]) {
        const pip = pips[i]!;
        const color = SHARDS[i]!.color;
        pip.dataset['level'] = String(lvl);
        pip.style.background = lvl > 0 ? color : 'transparent';
        pip.style.boxShadow = lvl > 0 ? `0 0 ${4 + lvl * 2}px ${color}` : 'none';
        pip.style.borderColor = lvl > 0 ? color : '';
        lastPipLevels[i] = lvl;
      }
    }

    // Refresh views after update() — Rust rebuilt the buffers during update.
    refreshCircles();
    refreshBeams();

    renderer.render(
      pixelW, pixelH,
      viewW, viewH,
      [game.camera_x(), game.camera_y()],
      circlesView, circlesLen,
      beamsView, beamsLen,
      [game.shake_x(), game.shake_y()],
    );

    // FPS readout ~2×/s.
    fpsFrames++;
    if (now - fpsLast > 500) {
      const fps = (fpsFrames * 1000) / (now - fpsLast);
      statusEl.textContent = `${fps.toFixed(0)} fps · ${circlesLen}c ${beamsLen}b`;
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
