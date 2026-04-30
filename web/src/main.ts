// Bootstrap for step 2+3 — wires WASM ↔ Renderer ↔ Input, drives the RAF loop,
// and manages the HUD (rank / kills / XP bar / shard tray) plus the level-up
// modal. The modal is pure DOM over a blurred live canvas; Rust pauses the
// simulation whenever `is_leveling_up()` is true, so the frozen scene stays
// visible through the backdrop filter.

import init, { Game } from '../wasm/prism.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';

const CIRCLE_STRIDE_FLOATS = 8;
const BEAM_STRIDE_FLOATS = 10;

// Must stay in index-lock with Rust's SYNERGIES const (src/shards.rs).
// Order determines bit positions in active_synergy_bits() / near_synergy_bits().
const SYNERGY_NAMES: string[] = [
  'CHAIN REACTION', 'BLIZZARD', 'SUPERNOVA', 'PRISM CANNON', 'TRACKING ECHO',
  'FROZEN ORBIT', 'EVENT HORIZON', 'BLOOD PACT', 'MARTYRDOM', 'RESONANCE', 'GRAVITY WELL',
];
const BOSS_NAMES: string[] = ['PRISM SENTINEL'];

// Must stay in index-lock with Rust's ShardKind enum (src/shards.rs).
type Rarity = 'common' | 'rare' | 'legendary';
interface ShardMeta { name: string; color: string; desc: string; synergies: string[]; rarity: Rarity }
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
  { name: 'INTERFERENCE', color: '#9a9dff', rarity: 'legendary', desc: 'standing-wave pulses ripple outward',  synergies: ['BARRIER → RESONANCE', 'MAGNET → GRAVITY WELL'] },
  { name: 'SIPHON',       color: '#a3ffdb', rarity: 'common',    desc: 'beams heal you on every hit',          synergies: ['THORNS → BLOOD PACT (close-range only)'] },
  { name: 'FROST',        color: '#b3e5fc', rarity: 'common',    desc: 'beams slow enemies on hit',            synergies: ['HALO → FROZEN ORBIT', 'SPLIT → BLIZZARD'] },
  { name: 'BARRIER',      color: '#64b5f6', rarity: 'common',    desc: 'energy shield absorbs + deals damage', synergies: ['INTERFERENCE → RESONANCE'] },
  { name: 'THORNS',       color: '#ef5350', rarity: 'rare',      desc: 'taking damage fires retaliatory beams',synergies: ['SIPHON → BLOOD PACT (close-range heal)', 'CASCADE → MARTYRDOM'] },
  { name: 'MAGNET',       color: '#7cffd4', rarity: 'common',    desc: 'pull radiance gems from farther away', synergies: ['INTERFERENCE → GRAVITY WELL'] },
  { name: 'MOMENTUM',     color: '#d7ff6f', rarity: 'common',    desc: 'move faster and dash more often',      synergies: ['HALO → EVENT HORIZON'] },
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

  // Timer + wave elements.
  const timerRaw = document.getElementById('timer');
  const waveLabelRaw = document.getElementById('wave-label');
  if (!timerRaw || !waveLabelRaw) {
    throw new Error('Timer elements missing from index.html');
  }
  const timerEl: HTMLElement = timerRaw;
  const waveLabelEl: HTMLElement = waveLabelRaw;

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

  // Synergy HUD.
  const synergiesHudRaw = document.getElementById('synergies-hud');
  if (!synergiesHudRaw) throw new Error('synergies-hud missing from index.html');
  const synergiesHudEl: HTMLElement = synergiesHudRaw;

  // Dash + wave clear elements.
  const dashFillRaw = document.getElementById('dash-fill');
  const waveClearRaw = document.getElementById('wave-clear');
  const deathTitleRaw = document.getElementById('death-title');
  const bossHudRaw = document.getElementById('boss-hud');
  const bossNameRaw = document.getElementById('boss-name');
  const bossFillRaw = document.getElementById('boss-fill');
  if (!dashFillRaw || !waveClearRaw || !deathTitleRaw || !bossHudRaw || !bossNameRaw || !bossFillRaw) {
    throw new Error('Dash/wave-clear elements missing from index.html');
  }
  const dashFillEl: HTMLElement = dashFillRaw;
  const waveClearEl: HTMLElement = waveClearRaw;
  const deathTitleEl: HTMLElement = deathTitleRaw;
  const bossHudEl: HTMLElement = bossHudRaw;
  const bossNameEl: HTMLElement = bossNameRaw;
  const bossFillEl: HTMLElement = bossFillRaw;

  // Boot WASM. `wasm.memory.buffer` is the ArrayBuffer we re-view as typed
  // arrays every frame — it can grow, so we must check for buffer identity.
  const wasm = await init();
  const memory: WebAssembly.Memory = wasm.memory;

  // Build synergy tag elements — one per synergy, hidden until active or near.
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

  // Build the shard tray — one pip per shard. Filled in as levels rise.
  trayEl.innerHTML = '';
  const pips: HTMLElement[] = [];
  for (let i = 0; i < SHARDS.length; i++) {
    const pip = document.createElement('div');
    pip.className = 'shard-pip';
    pip.dataset['level'] = '0';
    pip.title = SHARDS[i]!.name;
    trayEl.appendChild(pip);
    pips.push(pip);
  }

  const renderer = new Renderer(canvas);
  const input = new Input(canvas);
  const audio = new AudioManager();

  // Initialize AudioContext on first user gesture (browser autoplay policy).
  const initAudio = (): void => { audio.init(); audio.resume(); };
  window.addEventListener('keydown', initAudio, { once: true });
  window.addEventListener('pointerdown', initAudio, { once: true });

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
  let lastTimerStr = '';
  let lastWave = -1;
  let lastBossActive = false;
  let lastBossKind = -2;
  let lastBossPct = -1;
  const lastPipLevels: number[] = new Array(SHARDS.length).fill(-1);
  let lastActiveBits = -1;
  let lastNearBits = -1;

  // --- Level-up modal ----------------------------------------------------

  let modalShown = false;

  const renderLevelUpCards = (): void => {
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
      if (meta.rarity === 'rare') card.style.borderColor = 'rgba(127,211,255,0.3)';
      if (meta.rarity === 'legendary') card.style.borderColor = 'rgba(255,215,64,0.4)';

      let synergyHtml = '';
      if (meta.synergies.length > 0) {
        synergyHtml = `<div class="shard-synergy">${meta.synergies.map(s => `<span>⚡ ${s}</span>`).join('')}</div>`;
      }

      card.innerHTML =
        `<div class="shard-rarity ${meta.rarity}">${meta.rarity}</div>` +
        `<div class="shard-icon" style="background:${meta.color};color:${meta.color}"></div>` +
        `<div class="shard-name">${meta.name}</div>` +
        `<div class="shard-level">LVL ${currentLevel} → ${nextLevel}</div>` +
        `<div class="shard-desc">${meta.desc}</div>` +
        synergyHtml +
        `<div class="shard-hotkey">${slot + 1}</div>`;
      card.addEventListener('click', () => { game.select_shard(slot); });
      levelupCardsEl.appendChild(card);
    }

    const charges = game.reroll_charges();
    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'levelup-action';
    rerollBtn.type = 'button';
    rerollBtn.disabled = charges === 0;
    rerollBtn.textContent = `REROLL [R]  ×${charges}`;
    rerollBtn.addEventListener('click', () => {
      game.reroll_level_up();
      renderLevelUpCards();
    });
    levelupCardsEl.appendChild(rerollBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'levelup-action';
    skipBtn.type = 'button';
    skipBtn.textContent = 'SKIP [S]  +6 HP';
    skipBtn.addEventListener('click', () => { game.skip_level_up(); });
    levelupCardsEl.appendChild(skipBtn);
  };

  const showLevelUpModal = (): void => {
    levelupRankEl.textContent = 'RANK ' + game.rank();
    renderLevelUpCards();
    levelupEl.classList.add('shown');
    audio.duck(true);
    modalShown = true;
  };

  const hideLevelUpModal = (): void => {
    levelupEl.classList.remove('shown');
    levelupCardsEl.innerHTML = '';
    audio.duck(false);
    modalShown = false;
  };

  window.addEventListener('keydown', (e) => {
    if (!modalShown) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 3) {
      game.select_shard(n - 1);
      e.preventDefault();
    }
    if (e.key === 's' || e.key === 'S') {
      game.skip_level_up();
      e.preventDefault();
    }
    if (e.key === 'r' || e.key === 'R') {
      game.reroll_level_up();
      renderLevelUpCards();
      e.preventDefault();
    }
  });

  // --- Death screen ------------------------------------------------------

  let deathShown = false;

  const ENEMY_KIND_NAMES = ['DRONE', 'BRUTE', 'DASHER', 'SPLITTER', 'ORBITER', 'EMITTER', 'PULSAR', 'UMBRA'];

  const showDeathScreen = (victory: boolean = false): void => {
    if (victory) {
      deathTitleEl.textContent = 'VICTORY';
      deathTitleEl.classList.add('victory-title');
    } else {
      deathTitleEl.textContent = 'SHATTERED';
      deathTitleEl.classList.remove('victory-title');
    }
    deathScoreEl.textContent = String(game.score());
    const t = game.timer();
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const dmgTaken = Math.round(game.damage_taken());
    const barrierAbs = Math.round(game.barrier_absorbed());
    const gems = game.gems_collected();
    const bossKills = game.boss_kills_count();
    deathStatsEl.innerHTML =
      `RANK ${game.rank()}  /  PEAK ${game.peak_rank()}<br>` +
      `${game.kills_total()} KILLS  /  ${timeStr} SURVIVED<br>` +
      `${dmgTaken} DMG TAKEN  /  ${barrierAbs} ABSORBED<br>` +
      `${gems} GEMS  /  ${bossKills} BOSSES`;
    deathScreenEl.classList.add('shown');
    deathShown = true;
    if (victory) audio.playVictory(); else audio.playDeath();

    // Debug run summary.
    const killsByKind = ENEMY_KIND_NAMES.map((n, i) => `${n}: ${game.kills_by_kind(i)}`).join(', ');
    const shardSummary = SHARDS.map((s, i) => {
      const lvl = game.inventory_level(i);
      return lvl > 0 ? `${s.name} ${lvl}` : null;
    }).filter(Boolean).join(', ');
    console.log(
      `[PRISM RUN SUMMARY]\n` +
      `  outcome: ${victory ? 'VICTORY' : 'DEATH'}  |  time: ${timeStr}  |  score: ${game.score()}\n` +
      `  rank: ${game.rank()} (peak ${game.peak_rank()})  |  kills: ${game.kills_total()}  |  bosses: ${bossKills}\n` +
      `  dmg taken: ${dmgTaken}  |  barrier absorbed: ${barrierAbs}  |  gems: ${gems}\n` +
      `  kills by kind: ${killsByKind}\n` +
      `  shards: ${shardSummary || 'none'}`
    );
  };

  const hideDeathScreen = (): void => {
    deathScreenEl.classList.remove('shown');
    deathShown = false;
    // Reset HUD change-detection so everything redraws.
    lastRank = -1;
    lastKills = -1;
    lastXpPct = -1;
    lastHpPct = -1;
    lastTimerStr = '';
    lastWave = -1;
    lastBossActive = false;
    lastBossKind = -2;
    lastBossPct = -1;
    lastPipLevels.fill(-1);
    lastActiveBits = -1;
    lastNearBits = -1;
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
    game.set_dash_input(input.consumeDash());
    game.update(dt);

    // Audio tick — reads per-frame counters set during game.update().
    if (!deathShown && !modalShown) {
      audio.tick(dt,
        game.audio_beam_count(),
        game.audio_kill_count(),
        game.audio_gem_count(),
        game.audio_event_bits(),
        game.active_synergy_bits(),
      );
    }

    // Death / victory screen edges.
    const isDead = game.is_dead();
    const isVictory = game.is_victory();
    if ((isDead || isVictory) && !deathShown) showDeathScreen(isVictory);

    // Dash cooldown indicator.
    const dashPct = game.dash_cooldown_pct();
    dashFillEl.style.width = ((1 - dashPct) * 100) + '%';

    // Wave clear banner.
    const wcTimer = game.wave_clear_timer();
    if (wcTimer > 0) waveClearEl.classList.add('shown');
    else waveClearEl.classList.remove('shown');

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
    // Timer.
    const t = game.timer();
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const timerStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (timerStr !== lastTimerStr) {
      timerEl.textContent = timerStr;
      lastTimerStr = timerStr;
    }
    // Wave.
    const wave = game.wave();
    if (wave !== lastWave) {
      waveLabelEl.textContent = `WAVE ${wave + 1}`;
      lastWave = wave;
    }
    const bossActive = game.boss_active();
    if (bossActive !== lastBossActive) {
      bossHudEl.classList.toggle('shown', bossActive);
      lastBossActive = bossActive;
      lastBossPct = -1;
      lastBossKind = -2;
    }
    if (bossActive) {
      const bossKind = game.boss_kind_index();
      if (bossKind !== lastBossKind) {
        bossNameEl.textContent = BOSS_NAMES[bossKind] ?? 'UNKNOWN PRISM';
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
        const pip = pips[i]!;
        const color = SHARDS[i]!.color;
        pip.dataset['level'] = String(lvl);
        pip.style.background = lvl > 0 ? color : 'transparent';
        pip.style.boxShadow = lvl > 0 ? `0 0 ${4 + lvl * 2}px ${color}` : 'none';
        pip.style.borderColor = lvl > 0 ? color : '';
        lastPipLevels[i] = lvl;
      }
    }
    // Synergy HUD — update only when bitmasks change.
    const activeBits = game.active_synergy_bits();
    const nearBits = game.near_synergy_bits();
    if (activeBits !== lastActiveBits || nearBits !== lastNearBits) {
      for (let i = 0; i < synergyTags.length; i++) {
        const tag = synergyTags[i]!;
        const isActive = (activeBits >>> i & 1) === 1;
        const isNear = (nearBits >>> i & 1) === 1;
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
      now / 1000,
      game.arena_radius(),
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
