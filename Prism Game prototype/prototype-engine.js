// Prism-OS — Interactive Prototype
// A live, clickable bullet-heaven HUD. Auto-firing beams, enemies that march
// in, gems that pull, level-ups that pause for a real shard pick, synergy
// procs that flash, boss intro at 90s, death/victory states.
//
// All in canvas + DOM HUD. Game loop is rAF; HUD is React.

(function() {
const PO = {
  bg: '#020308', ink: '#a8f4ff', dim: 'rgba(168,244,255,0.45)',
  faint: 'rgba(168,244,255,0.16)', amber: '#ffae6c', danger: '#ff5b6e',
  green: '#7dffb0', legend: '#ffd96b', purple: '#c9a3ff',
};

// Game tuning
const TUNE = {
  arenaR: 360,                  // playable radius (logical px around player)
  baseDamage: 14,
  baseFireRate: 1.6,            // shots per second
  baseBeamCount: 3,
  baseSpread: 0.5,              // radians
  beamSpeed: 720,
  beamLife: 0.55,
  enemySpawnRate: 1.4,          // /s base
  enemySpeed: 70,
  playerSpeed: 220,
  dashSpeed: 760,
  dashDur: 0.18,
  dashCD: 1.2,
  baseHP: 130,
  xpToLevel: (lv) => Math.floor(40 + lv * 22 + lv * lv * 4),
  bossAt: 90,                   // first boss at 90s
  runDur: 900,                  // 15 min
};

// ---- Shard runtime stats (which we'll affect when a shard levels) ----
const SHARD_FX = {
  SPLIT:    (lv, st) => { st.beamCount += lv; st.spread += 0.08 * lv; },
  REFRACT:  (lv, st) => { st.homing = Math.max(st.homing, 0.3 + lv * 0.12); },
  MIRROR:   (lv, st) => { st.radial += lv; },
  CHROMATIC:(lv, st) => { st.chromatic = lv; },
  LENS:     (lv, st) => { st.damageMul *= (1 + 0.15 * lv); st.beamWidth += lv * 0.6; },
  DIFFRACT: (lv, st) => { st.burstOnHit = lv; },
  ECHO:     (lv, st) => { st.echo = lv; },
  HALO:     (lv, st) => { st.halo = lv; },
  CASCADE:  (lv, st) => { st.fork = lv; },
  INTERFERENCE: (lv, st) => { st.pulse = lv; },
  SIPHON:   (lv, st) => { st.lifesteal = lv * 0.04; },
  FROST:    (lv, st) => { st.slow = lv * 0.12; },
  BARRIER:  (lv, st) => { st.shield = lv; },
  THORNS:   (lv, st) => { st.thorns = lv; },
  MAGNET:   (lv, st) => { st.pickupR = 80 + lv * 30; },
  MOMENTUM: (lv, st) => { st.moveMul *= (1 + 0.06 * lv); st.dashCDMul *= (1 - 0.08 * lv); },
  ARMOR:    (lv, st) => { st.dmgReduction = 1 - Math.pow(0.92, lv); },
  LUCK:     (lv, st) => { st.luck = lv; },
  'PRISM HEART': (lv, st) => { st.maxHP += 15 * lv; },
  'PHASE STEP': (lv, st) => { st.iframe = 0.2 + lv * 0.06; },
  ARC:      (lv, st) => { st.chain = lv; },
  MINEFIELD:(lv, st) => { st.mines = lv; },
  LANCE:    (lv, st) => { st.lance = lv; },
};

const ENEMY_TYPES = [
  { hp: 14, r: 9,  speed: 1.0,  color: '#ff5e7a', xp: 1 },   // grunt
  { hp: 28, r: 12, speed: 0.85, color: '#ffaa55', xp: 2 },   // bruiser
  { hp: 9,  r: 7,  speed: 1.4,  color: '#aa66ff', xp: 1 },   // darter
  { hp: 60, r: 16, speed: 0.7,  color: '#66ddff', xp: 4 },   // tank
];

function rand(min, max) { return Math.random() * (max - min) + min; }

// ──────────────────────── ENGINE ────────────────────────
function makeGame(opts = {}) {
  const G = {
    t: 0, dt: 0, paused: false, over: false, victory: false,
    elapsed: 0,
    rank: 1, xp: 0, kills: 0, score: 0,
    bestScore: opts.bestScore ?? 5118,
    // player
    p: { x: 0, y: 0, vx: 0, vy: 0, hp: TUNE.baseHP, maxHP: TUNE.baseHP, dash: 0, dashCD: 0, iframe: 0 },
    keys: new Set(),
    aim: { x: 1, y: 0 },
    cam: { shake: 0 },
    // entities
    enemies: [], beams: [], gems: [], pops: [], rings: [], particles: [], orbs: [],
    boss: null, bossAnnounced: false, bossSpawned: false,
    // shard inventory
    shards: {}, // name -> level
    evolutions: new Set(),
    synergies: new Set(),
    pendingLevels: 0,         // queued level-ups
    // derived stats
    stats: {},
    nextSpawn: 0.5,
    flashes: [],              // banner/synergy banners
    fireT: 0,
    haloT: 0,
    pulseT: 0,
    lanceT: 0,
    mineT: 0,
    bossPhase: 0,
    bossHpMax: 14800,
    listeners: new Set(),
    sound: opts.sound ?? false,
  };

  // Seed: give player a couple shards already so HUD has chips
  G.shards['SPLIT'] = 4;
  G.shards['HALO'] = 2;
  G.shards['MAGNET'] = 6;     // pre-evolved to magnet for nice pickups
  G.shards['MOMENTUM'] = 6;
  G.shards['FROST'] = 5;
  G.shards['DIFFRACT'] = 3;
  G.shards['BARRIER'] = 1;
  recompute(G);
  G.p.hp = G.p.maxHP;

  return G;
}

function recompute(G) {
  const st = {
    damageMul: 1, fireRateMul: 1, moveMul: 1, dashCDMul: 1,
    beamCount: TUNE.baseBeamCount, spread: TUNE.baseSpread, beamWidth: 1,
    radial: 0, homing: 0, chromatic: 0, fork: 0, echo: 0, halo: 0,
    pulse: 0, burstOnHit: 0, slow: 0, lifesteal: 0, shield: 0, thorns: 0,
    pickupR: 80, dmgReduction: 0, luck: 0, maxHP: TUNE.baseHP,
    iframe: 0.18, chain: 0, mines: 0, lance: 0,
  };
  for (const [name, lv] of Object.entries(G.shards)) {
    SHARD_FX[name]?.(lv, st);
  }
  // Synergy procs
  G.synergies = new Set();
  if ((G.shards.SPLIT||0) >= 4 && (G.shards.CASCADE||0) >= 1) G.synergies.add('CHAIN REACTION');
  if ((G.shards.FROST||0) >= 4 && (G.shards.DIFFRACT||0) >= 3) G.synergies.add('BLIZZARD');
  if ((G.shards.HALO||0) >= 4 && (G.shards.LANCE||0) >= 3) G.synergies.add('SOLAR LANCE');
  if ((G.shards.MAGNET||0) >= 4 && (G.shards.INTERFERENCE||0) >= 3) G.synergies.add('SINGULARITY');
  if ((G.shards.ECHO||0) >= 3 && (G.shards.MOMENTUM||0) >= 3) G.synergies.add('AFTERIMAGE');
  if ((G.shards.MIRROR||0) >= 4 && (G.shards.SPLIT||0) >= 4) G.synergies.add('KALEIDOSCOPE');
  G.stats = st;
  G.p.maxHP = st.maxHP;
}

function spawnEnemy(G) {
  const a = Math.random() * Math.PI * 2;
  const r = TUNE.arenaR * 1.05;
  // Type weighting ramps over time
  const t = G.elapsed;
  const wTank = t > 60 ? 0.18 : 0.05;
  const wBruise = t > 30 ? 0.25 : 0.1;
  const roll = Math.random();
  const idx = roll < wTank ? 3 : roll < wTank + wBruise ? 1 : roll < wTank + wBruise + 0.25 ? 2 : 0;
  const t0 = ENEMY_TYPES[idx];
  G.enemies.push({
    x: G.p.x + Math.cos(a) * r, y: G.p.y + Math.sin(a) * r,
    vx: 0, vy: 0,
    hp: t0.hp * (1 + t / 120), maxHp: t0.hp * (1 + t / 120),
    r: t0.r, speed: t0.speed, color: t0.color, xp: t0.xp, slow: 0, kind: idx,
  });
}

function spawnBoss(G) {
  G.boss = {
    x: G.p.x, y: G.p.y - 250, vx: 0, vy: 0,
    hp: G.bossHpMax, maxHp: G.bossHpMax, r: 50,
    color: PO.danger, phase: 1,
    shieldA: 0, // angle for orbiting shields
  };
  G.bossSpawned = true;
  G.flashes.push({ kind: 'boss', t: 0 });
}

function fire(G) {
  const ax = G.aim.x, ay = G.aim.y;
  const aim = Math.atan2(ay, ax);
  const st = G.stats;
  const count = st.beamCount;
  const spread = st.spread;
  const start = -spread / 2;
  const step = count > 1 ? spread / (count - 1) : 0;
  const emit = (a, dmgMul = 1) => {
    G.beams.push({
      x: G.p.x, y: G.p.y, vx: Math.cos(a) * TUNE.beamSpeed, vy: Math.sin(a) * TUNE.beamSpeed,
      life: TUNE.beamLife, dmg: TUNE.baseDamage * st.damageMul * dmgMul,
      w: 2 + st.beamWidth, color: '#ffffff',
      hits: new Set(), homing: st.homing, fork: st.fork, chain: st.chain,
      forks: 0,
    });
  };
  for (let i = 0; i < count; i++) emit(aim + start + step * i);
  // Mirror radial
  for (let i = 0; i < st.radial; i++) {
    const a = (i / Math.max(1, st.radial)) * Math.PI * 2;
    emit(a, 0.6);
  }
  // Chromatic split
  if (st.chromatic) {
    emit(aim - 0.05, 0.5);
    emit(aim + 0.05, 0.5);
  }
  // Echo
  if (st.echo) {
    setTimeout(() => {
      if (G.over || G.paused) return;
      for (let i = 0; i < count; i++) emit(aim + start + step * i, 0.5);
    }, 180);
  }
}

function damageBoss(G, amount) {
  G.boss.hp -= amount;
  G.cam.shake = Math.max(G.cam.shake, 6);
  if (G.boss.hp < G.bossHpMax * 0.66 && G.boss.phase < 2) G.boss.phase = 2;
  if (G.boss.hp < G.bossHpMax * 0.33 && G.boss.phase < 3) G.boss.phase = 3;
  if (G.boss.hp <= 0) {
    G.victory = true; G.over = true;
    G.cam.shake = 16;
  }
}

function step(G, dt) {
  if (G.paused || G.over) return;
  G.dt = dt;
  G.elapsed += dt;

  // Win on time
  if (G.elapsed >= TUNE.runDur) { G.victory = true; G.over = true; }

  // Boss announce + spawn
  if (!G.bossAnnounced && G.elapsed >= TUNE.bossAt - 3) {
    G.bossAnnounced = true;
    G.flashes.push({ kind: 'boss-warn', t: 0 });
  }
  if (!G.bossSpawned && G.elapsed >= TUNE.bossAt) {
    spawnBoss(G);
  }

  // ── Player input
  const k = G.keys;
  let dx = 0, dy = 0;
  if (k.has('w') || k.has('arrowup')) dy -= 1;
  if (k.has('s') || k.has('arrowdown')) dy += 1;
  if (k.has('a') || k.has('arrowleft')) dx -= 1;
  if (k.has('d') || k.has('arrowright')) dx += 1;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  if (G.p.dash > 0) {
    G.p.x += G.p.vx * dt;
    G.p.y += G.p.vy * dt;
    G.p.dash -= dt;
    G.p.iframe = Math.max(G.p.iframe, 0.05);
  } else {
    const speed = TUNE.playerSpeed * G.stats.moveMul;
    G.p.vx = dx * speed; G.p.vy = dy * speed;
    G.p.x += G.p.vx * dt; G.p.y += G.p.vy * dt;
  }
  G.p.iframe = Math.max(0, G.p.iframe - dt);
  G.p.dashCD = Math.max(0, G.p.dashCD - dt);

  // Aim toward nearest enemy (auto)
  let target = null, td = Infinity;
  for (const e of G.enemies) {
    const d = Math.hypot(e.x - G.p.x, e.y - G.p.y);
    if (d < td) { td = d; target = e; }
  }
  if (G.boss) {
    const d = Math.hypot(G.boss.x - G.p.x, G.boss.y - G.p.y);
    if (d < td) { td = d; target = G.boss; }
  }
  if (target) {
    const ax = target.x - G.p.x, ay = target.y - G.p.y;
    const al = Math.hypot(ax, ay) || 1;
    G.aim.x = ax / al; G.aim.y = ay / al;
  }

  // Auto-fire
  G.fireT += dt;
  const fireInterval = 1 / TUNE.baseFireRate;
  if (G.fireT >= fireInterval) {
    G.fireT = 0;
    fire(G);
  }

  // Halo orbs
  if (G.stats.halo > 0) {
    G.haloT += dt;
    G.orbs = [];
    const n = G.stats.halo + 2;
    const r = 70;
    for (let i = 0; i < n; i++) {
      const a = G.haloT * 2 + (i / n) * Math.PI * 2;
      G.orbs.push({ x: G.p.x + Math.cos(a) * r, y: G.p.y + Math.sin(a) * r });
    }
  }

  // Pulse rings (Interference)
  if (G.stats.pulse > 0) {
    G.pulseT += dt;
    if (G.pulseT > 2.0) {
      G.pulseT = 0;
      G.rings.push({ x: G.p.x, y: G.p.y, r: 10, max: 280, dmg: 30 * G.stats.pulse, hits: new Set() });
    }
  }

  // Lance shot
  if (G.stats.lance > 0) {
    G.lanceT += dt;
    if (G.lanceT > 3.5) {
      G.lanceT = 0;
      const a = Math.atan2(G.aim.y, G.aim.x);
      G.beams.push({
        x: G.p.x, y: G.p.y, vx: Math.cos(a) * TUNE.beamSpeed * 1.6, vy: Math.sin(a) * TUNE.beamSpeed * 1.6,
        life: 1.2, dmg: 100 * G.stats.lance, w: 4, color: PO.legend, hits: new Set(),
        homing: 0, fork: 0, chain: 0, forks: 0, lance: true,
      });
    }
  }

  // Enemies
  G.nextSpawn -= dt;
  const rate = TUNE.enemySpawnRate * (1 + G.elapsed / 60);
  while (G.nextSpawn <= 0) { spawnEnemy(G); G.nextSpawn += 1 / rate; }

  for (const e of G.enemies) {
    const sx = G.p.x - e.x, sy = G.p.y - e.y;
    const sl = Math.hypot(sx, sy) || 1;
    const slowMul = 1 - Math.min(0.85, e.slow);
    e.x += (sx / sl) * TUNE.enemySpeed * e.speed * slowMul * dt;
    e.y += (sy / sl) * TUNE.enemySpeed * e.speed * slowMul * dt;
    e.slow = Math.max(0, e.slow - dt * 0.5);

    // Player collision
    const d = Math.hypot(e.x - G.p.x, e.y - G.p.y);
    if (d < e.r + 9 && G.p.iframe <= 0) {
      const dmg = Math.max(1, 8 * (1 - G.stats.dmgReduction));
      G.p.hp -= dmg;
      G.p.iframe = G.stats.iframe;
      G.cam.shake = 4;
      G.pops.push({ x: G.p.x, y: G.p.y - 16, t: 0, txt: '-' + Math.round(dmg), color: PO.danger });
      if (G.p.hp <= 0) { G.over = true; }
    }
    // Halo damage
    if (G.stats.halo > 0) {
      for (const o of G.orbs) {
        if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + 8) {
          e.hp -= 6 * G.stats.halo * dt * 60 / 60; // per frame-ish
        }
      }
    }
  }

  // Pulse rings expand
  for (const ring of G.rings) {
    ring.r += 220 * dt;
    for (const e of G.enemies) {
      if (!ring.hits.has(e) && Math.abs(Math.hypot(e.x - ring.x, e.y - ring.y) - ring.r) < 18) {
        ring.hits.add(e);
        e.hp -= ring.dmg;
        e.slow = Math.max(e.slow, G.stats.slow);
        G.pops.push({ x: e.x, y: e.y, t: 0, txt: Math.round(ring.dmg), color: PO.purple });
      }
    }
  }
  G.rings = G.rings.filter(r => r.r < r.max);

  // Beams
  for (const b of G.beams) {
    if (b.homing > 0 && target) {
      const tx = target.x - b.x, ty = target.y - b.y;
      const tl = Math.hypot(tx, ty) || 1;
      const desired = { x: (tx/tl) * TUNE.beamSpeed, y: (ty/tl) * TUNE.beamSpeed };
      b.vx = b.vx * (1 - b.homing * dt) + desired.x * b.homing * dt;
      b.vy = b.vy * (1 - b.homing * dt) + desired.y * b.homing * dt;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;

    // Check enemies
    const allTargets = G.enemies.slice();
    if (G.boss) allTargets.push(G.boss);
    for (const e of allTargets) {
      if (b.hits.has(e)) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.w + 2) {
        const dmg = b.dmg * (e === G.boss ? 1.4 : 1) * (G.synergies.has('CHAIN REACTION') ? 1.15 : 1);
        if (e === G.boss) {
          damageBoss(G, dmg);
        } else {
          e.hp -= dmg;
          e.slow = Math.max(e.slow, G.stats.slow);
        }
        b.hits.add(e);
        G.pops.push({ x: e.x, y: e.y - 10, t: 0, txt: Math.round(dmg), color: '#fff' });
        // Diffract burst
        if (G.stats.burstOnHit > 0 && Math.random() < 0.25) {
          for (let i = 0; i < 6; i++) G.particles.push({ x: e.x, y: e.y, vx: Math.cos(i)*120, vy: Math.sin(i)*120, life: 0.3, color: '#8efff4' });
        }
        // Lifesteal
        if (G.stats.lifesteal > 0) {
          G.p.hp = Math.min(G.p.maxHP, G.p.hp + dmg * G.stats.lifesteal);
        }
        if (!b.lance) b.life = Math.min(b.life, 0.05);
        break;
      }
    }
  }
  G.beams = G.beams.filter(b => b.life > 0);

  // Kill enemies + drop gems
  const survivors = [];
  for (const e of G.enemies) {
    if (e.hp <= 0) {
      G.kills++;
      G.score += 10 * e.xp;
      G.gems.push({ x: e.x, y: e.y, vx: rand(-30,30), vy: rand(-30,30), life: 12, value: e.xp, picked: false });
      // Cascade fork
      if (G.stats.fork > 0 && Math.random() < 0.4 + G.stats.fork * 0.1) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          G.beams.push({ x: e.x, y: e.y, vx: Math.cos(a) * TUNE.beamSpeed * 0.7, vy: Math.sin(a) * TUNE.beamSpeed * 0.7,
            life: 0.4, dmg: TUNE.baseDamage * G.stats.damageMul * 0.6, w: 1.4, color: PO.legend, hits: new Set(), homing: 0.4, fork: 0, chain: 0, forks: 0 });
        }
      }
      // Particles
      for (let i = 0; i < 8; i++) {
        G.particles.push({ x: e.x, y: e.y, vx: rand(-180,180), vy: rand(-180,180), life: 0.4, color: e.color });
      }
    } else survivors.push(e);
  }
  G.enemies = survivors;

  // Gems
  for (const g of G.gems) {
    g.life -= dt;
    const dx2 = G.p.x - g.x, dy2 = G.p.y - g.y;
    const dl = Math.hypot(dx2, dy2) || 1;
    if (dl < G.stats.pickupR) {
      g.x += (dx2/dl) * 280 * dt; g.y += (dy2/dl) * 280 * dt;
    } else {
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.92; g.vy *= 0.92;
    }
    if (dl < 14) {
      g.picked = true;
      G.xp += g.value * 3;
      const need = TUNE.xpToLevel(G.rank);
      if (G.xp >= need) {
        G.xp -= need;
        G.rank += 1;
        G.pendingLevels += 1;
      }
    }
  }
  G.gems = G.gems.filter(g => !g.picked && g.life > 0);

  // Pops
  for (const p of G.pops) p.t += dt;
  G.pops = G.pops.filter(p => p.t < 0.9);
  for (const pa of G.particles) { pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.life -= dt; pa.vx *= 0.95; pa.vy *= 0.95; }
  G.particles = G.particles.filter(p => p.life > 0);

  // Boss tick
  if (G.boss) {
    const sx = G.p.x - G.boss.x, sy = G.p.y - G.boss.y;
    const sl = Math.hypot(sx,sy) || 1;
    G.boss.x += (sx/sl) * 30 * dt;
    G.boss.y += (sy/sl) * 30 * dt;
    G.boss.shieldA += dt * 1.2;
    // Boss collide
    if (Math.hypot(G.boss.x - G.p.x, G.boss.y - G.p.y) < G.boss.r + 9 && G.p.iframe <= 0) {
      const dmg = 18 * (1 - G.stats.dmgReduction);
      G.p.hp -= dmg;
      G.p.iframe = G.stats.iframe;
      G.cam.shake = 8;
      if (G.p.hp <= 0) { G.over = true; G.victory = false; }
    }
  }

  // Camera shake decay
  G.cam.shake = Math.max(0, G.cam.shake - dt * 30);

  // Dispatch
  G.listeners.forEach(fn => fn(G));
}

// ──────────────────────── RENDER (canvas) ────────────────────────
function render(ctx, G, w, h) {
  const cx = w/2, cy = h/2;
  const camX = G.p.x, camY = G.p.y;
  const shake = G.cam.shake;
  const shakeX = (Math.random() - 0.5) * shake;
  const shakeY = (Math.random() - 0.5) * shake;

  ctx.save();
  ctx.fillStyle = '#020308';
  ctx.fillRect(0, 0, w, h);

  // Vignette via radial
  const grad = ctx.createRadialGradient(cx, cy, 100, cx, cy, Math.max(w,h) * 0.7);
  grad.addColorStop(0, 'rgba(168,244,255,0.06)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

  // Translate world to player
  ctx.translate(cx - camX + shakeX, cy - camY + shakeY);

  // Arena grid (concentric)
  ctx.strokeStyle = 'rgba(168,244,255,0.08)'; ctx.lineWidth = 1;
  for (let r = 80; r <= TUNE.arenaR + 200; r += 80) {
    ctx.beginPath(); ctx.arc(G.p.x, G.p.y, r, 0, Math.PI*2); ctx.stroke();
  }
  // Radial spokes
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(G.p.x + Math.cos(a) * 80, G.p.y + Math.sin(a) * 80);
    ctx.lineTo(G.p.x + Math.cos(a) * (TUNE.arenaR + 100), G.p.y + Math.sin(a) * (TUNE.arenaR + 100));
    ctx.stroke();
  }
  // Outer arena ring
  ctx.strokeStyle = 'rgba(168,244,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(G.p.x, G.p.y, TUNE.arenaR + 60, 0, Math.PI*2); ctx.stroke();

  // Pulse rings
  for (const r of G.rings) {
    ctx.strokeStyle = `rgba(154,157,255,${0.6 * (1 - r.r / r.max)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = `rgba(154,157,255,${0.3 * (1 - r.r / r.max)})`; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke();
  }

  // Gems
  ctx.globalCompositeOperation = 'screen';
  for (const g of G.gems) {
    ctx.fillStyle = '#7fd3ff';
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI/4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = 'rgba(127,211,255,0.3)';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Enemies
  for (const e of G.enemies) {
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = e.color + '33';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 2.4, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
    if (e.slow > 0.05) {
      ctx.strokeStyle = '#b3e5fc'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI*2); ctx.stroke();
    }
    // tiny hp bar above
    if (e.hp < e.maxHp) {
      const w0 = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - w0/2, e.y - e.r - 8, w0, 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(e.x - w0/2, e.y - e.r - 8, w0 * (e.hp / e.maxHp), 2);
    }
  }

  // Boss
  if (G.boss) {
    const b = G.boss;
    ctx.globalCompositeOperation = 'screen';
    const bg2 = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, 200);
    bg2.addColorStop(0, 'rgba(255,91,110,0.4)');
    bg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg2; ctx.fillRect(b.x - 200, b.y - 200, 400, 400);
    ctx.globalCompositeOperation = 'source-over';
    // Body — hex
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.shieldA * 0.3);
    ctx.fillStyle = '#1a0810';
    ctx.strokeStyle = PO.danger; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * b.r, y = Math.sin(a) * b.r;
      i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PO.danger;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // Orbiting shields phase 1
    if (b.phase >= 1 && b.hp > 0) {
      const shields = b.phase === 1 ? 6 : b.phase === 2 ? 4 : 2;
      for (let i = 0; i < shields; i++) {
        const a = b.shieldA + (i / shields) * Math.PI * 2;
        const sx = b.x + Math.cos(a) * 80, sy = b.y + Math.sin(a) * 80;
        ctx.fillStyle = 'rgba(255,91,110,0.65)';
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  // Halo orbs
  ctx.globalCompositeOperation = 'screen';
  for (const o of G.orbs) {
    ctx.fillStyle = '#f5f5bc';
    ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(245,245,188,0.3)';
    ctx.beginPath(); ctx.arc(o.x, o.y, 12, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Beams
  ctx.globalCompositeOperation = 'screen';
  for (const b of G.beams) {
    const tx = b.x - b.vx * 0.04, ty = b.y - b.vy * 0.04;
    ctx.strokeStyle = b.color + 'aa'; ctx.lineWidth = b.w + 4;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = b.w;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Particles
  ctx.globalCompositeOperation = 'screen';
  for (const p of G.particles) {
    ctx.fillStyle = p.color + 'cc';
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Player
  const pulse = 1 + Math.sin(G.elapsed * 6) * 0.04;
  ctx.globalCompositeOperation = 'screen';
  const pg = ctx.createRadialGradient(G.p.x, G.p.y, 4, G.p.x, G.p.y, 60);
  pg.addColorStop(0, 'rgba(255,255,255,0.9)');
  pg.addColorStop(0.5, 'rgba(168,244,255,0.5)');
  pg.addColorStop(1, 'rgba(168,244,255,0)');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(G.p.x, G.p.y, 60 * pulse, 0, Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = G.p.iframe > 0 ? PO.purple : '#fff';
  ctx.beginPath(); ctx.arc(G.p.x, G.p.y, 9, 0, Math.PI*2); ctx.fill();
  // Reticle
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.arc(G.p.x, G.p.y, 30, 0, Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);

  // Damage popups (in world)
  for (const pop of G.pops) {
    const a = 1 - pop.t / 0.9;
    ctx.fillStyle = pop.color + Math.round(255*a).toString(16).padStart(2,'0');
    ctx.font = '600 13px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pop.txt, pop.x, pop.y - pop.t * 30);
  }

  ctx.restore();

  // Scanlines
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
}

window.PrismGame = { makeGame, step, render, recompute, fire, TUNE, PO };
})();
