# Prism — Enemy Roster & Wave Progression Design

> **Date:** 2026-04-18  
> **Constraint:** WebGL2 SDF circles only. Each enemy = `CircleInstance` (x, y, radius, r, g, b, a, glow) + movement logic in Rust.  
> **Session length:** 10 minutes (600 seconds). Player wins by surviving. Death remains possible via contact damage.  
> **Baseline player DPS:** ~500/s (beam=100 dmg × 5/s base fire rate, before shards)

---

## 1. Enemy Roster (7 Types)

### 1.1 Drone (existing, reworked)

The bread-and-butter. Cheap, numerous, individually non-threatening. Their danger is in mass.

| Stat | Value | Notes |
|------|-------|-------|
| **Color** | `(0.35, 0.18, 0.55)` | Purple — unchanged |
| **Glow** | `0.6` | Subtle |
| **Radius** | `9` | |
| **HP** | `80` | ↓ from 100 so early game feels snappy |
| **Speed** | `72` | |
| **Contact Damage** | `8` | |
| **Movement** | Drift toward player | `dir = normalize(player - self)` |
| **Death** | Standard particles (purple) | 10 particles |
| **First Appears** | 0:00 (Wave 1) | Always present |
| **XP Value** | `1` | |

**Scaling:** HP gains +15/min. At minute 9: `80 + 15×9 = 215 HP` (2-shot with base beam, 1-shot with Lens 2+).

```rust
// Movement: unchanged
let dir = (player_pos - self.pos).normalize_or_zero();
self.pos += dir * self.speed * dt;
```

---

### 1.2 Brute

Slow, massive, tanky. Creates a physical wall the player must navigate around. Its large radius blocks beam lines-of-sight to enemies behind it, forcing repositioning. The key spatial pressure element.

| Stat | Value | Notes |
|------|-------|-------|
| **Color** | `(0.85, 0.15, 0.10)` | Deep red |
| **Glow** | `1.2` | Hot, menacing |
| **Radius** | `22` | 2.4× drone — visually dominant |
| **HP** | `600` | Requires ~6 beam hits or sustained shard damage |
| **Speed** | `38` | ~53% of drone speed |
| **Contact Damage** | `25` | Punishing if touched |
| **Movement** | Drift toward player (same as drone, just slower) | |
| **Death** | 20 red particles + screen shake (6px) | Big satisfying pop |
| **First Appears** | 1:30 (Wave 3) | |
| **XP Value** | `5` | |

**Scaling:** HP gains +80/min from first appearance. At minute 9: `600 + 80×7.5 = 1200 HP`.

**Design intent:** Brutes are the "paragraph breaks" in combat. When a Brute appears, the player must decide: burn beams on it (ignoring drones flooding in) or kite around it and deal with drones first. Split/Mirror shards handle drones; Lens/Cascade handle Brutes. This creates build diversity pressure.

```rust
// Same movement as Drone, different speed constant
let dir = (player_pos - self.pos).normalize_or_zero();
self.pos += dir * self.speed * dt;
```

---

### 1.3 Dasher

Fast, fragile, aggressive. Pauses briefly (telegraph), then charges at high speed. The skill-check enemy — punishes stationary players, rewards dodging.

| Stat | Value | Notes |
|------|-------|-------|
| **Color (drifting)** | `(0.10, 0.75, 0.85)` | Cool cyan |
| **Color (charging)** | `(0.20, 1.0, 1.0)` | Bright cyan — visual telegraph |
| **Glow (drifting)** | `0.8` | |
| **Glow (charging)** | `3.0` | Flares up before charge — the "tell" |
| **Radius** | `7` | Slightly smaller than drone |
| **HP** | `60` | Fragile — one beam kills |
| **Speed (drift)** | `55` | Slower approach |
| **Speed (charge)** | `320` | 4.4× drone speed, nearly player speed |
| **Contact Damage** | `15` | |
| **Movement** | 3-phase: drift → wind-up (0.6s) → charge (0.4s) → cooldown (1.2s) | |
| **Death** | 8 cyan streak particles (high velocity, short life) | |
| **First Appears** | 2:00 (Wave 4) | |
| **XP Value** | `2` | |

**State machine:**
```rust
enum DasherState {
    Drift,                          // Move toward player at drift_speed
    WindUp { timer: f32 },          // Stop, glow increases over 0.6s
    Charge { dir: Vec2, timer: f32 }, // Locked direction, charge_speed for 0.4s
    Cooldown { timer: f32 },        // Drift slowly, can't re-charge for 1.2s
}

// Transition: Drift → WindUp when dist_to_player < 280
// WindUp → Charge after 0.6s (lock direction at transition)
// Charge → Cooldown after 0.4s OR after traveling 200px
// Cooldown → Drift after 1.2s
```

**Design intent:** The wind-up glow is the "read." Players who see the bright cyan flare have 0.6s to sidestep. The locked charge direction means perpendicular movement dodges it. This teaches movement mastery. In groups, Dashers create cross-fire patterns that demand constant repositioning.

**Scaling:** HP gains +10/min. Charge speed gains +15/min (caps at 420 at minute 8.7).

---

### 1.4 Splitter

Medium enemy that fractures into 3 Splinter minis on death. Creates wave-within-a-wave pacing: the kill is the beginning of the encounter, not the end.

| Stat | Value | Notes |
|------|-------|-------|
| **Color** | `(0.15, 0.80, 0.30)` | Bright green |
| **Glow** | `1.0` | |
| **Radius** | `14` | Between drone and brute |
| **HP** | `200` | 2 beam hits |
| **Speed** | `60` | Slightly slower than drone |
| **Contact Damage** | `12` | |
| **Movement** | Drift toward player | |
| **Death** | Spawns 3 Splinters + green particle burst | |
| **First Appears** | 3:00 (Wave 6) | |
| **XP Value** | `3` (parent) + `1` each (splinters) | |

**Splinter (child):**

| Stat | Value |
|------|-------|
| **Color** | `(0.25, 0.90, 0.45)` — lighter green |
| **Glow** | `0.5` |
| **Radius** | `5` — tiny |
| **HP** | `30` |
| **Speed** | `110` — fast scatter |
| **Contact Damage** | `5` |
| **Movement** | Burst away from parent death position for 0.3s, then drift toward player |
| **Death** | 4 small green particles |
| **XP Value** | `1` |

```rust
// On Splitter death:
let burst_angles = [0.0, TAU/3.0, 2.0*TAU/3.0]; // 120° apart
for &angle in &burst_angles {
    let burst_dir = Vec2::new(angle.cos(), angle.sin());
    spawn_splinter(parent_pos + burst_dir * 18.0, burst_dir);
}
// Splinter has 0.3s burst timer, then switches to player-drift
```

**Design intent:** Splitters punish players who ignore them — letting one reach melee means dealing with 3 fast minis in your face. They also interact beautifully with Cascade (chain kills from splinter deaths) and Diffract (AoE cleans minis). The split creates a micro-pacing beat: kill → burst → cleanup.

**Scaling:** Parent HP gains +30/min. Splinter HP gains +5/min. Splinter count stays at 3 (no scaling — already multiplicative).

---

### 1.5 Orbiter

Doesn't approach directly. Locks into an orbit around the player at a fixed radius, creating a persistent threat ring. Forces the player to move through them or wait for beams to pick them off. The spatial denial enemy.

| Stat | Value | Notes |
|------|-------|-------|
| **Color** | `(1.0, 0.60, 0.10)` | Warm orange |
| **Glow** | `1.4` | Bright, visible orbit |
| **Radius** | `10` | |
| **HP** | `150` | |
| **Speed** | `90` | Approach speed (before orbit lock) |
| **Orbit Radius** | `160` | Just outside comfortable beam-kiting range |
| **Orbit Speed** | `1.2 rad/s` | ~0.2 rev/s — trackable but persistent |
| **Contact Damage** | `12` | |
| **Movement** | Approach → orbit lock at target radius | |
| **Death** | Orange ring burst (12 particles in circle pattern) | |
| **First Appears** | 4:00 (Wave 8) | |
| **XP Value** | `3` | |

```rust
enum OrbiterState {
    Approach,  // Move toward player until within orbit_radius + 20
    Orbiting { angle: f32 }, // Maintain orbit_radius from player, rotate
}

// Approach → Orbiting: when dist_to_player < orbit_radius + 20
// Orbit maintains distance: 
//   let target_dist = orbit_radius;
//   let current_dist = dist_to_player;
//   let radial_correction = (target_dist - current_dist) * 2.0; // spring back to orbit
//   angle += orbit_speed * dt;
//   self.pos = player_pos + Vec2::new(angle.cos(), angle.sin()) * (orbit_radius + radial_correction * dt);
```

**Design intent:** Orbiters create a "cage" — 3-4 Orbiters surround the player in a ring of orange, restricting escape routes. The player must either burst through (taking damage) or kill them to open a gap. This creates genuine spatial puzzles. Mirror shard is strong against them (radial fire hits orbiting targets). They also serve as a "wall" that blocks the player's retreat from charging Dashers.

**Scaling:** HP gains +20/min. Orbit radius shrinks by 8/min (minimum 100 at minute 7.5), tightening the cage.

---

### 1.6 Pulsar

Area denial. Periodically swells to 3× radius in a bright flash, damaging anything nearby. Stationary when pulsing, mobile between pulses. The "don't stand here" enemy.

| Stat | Value | Notes |
|------|-------|-------|
| **Color (idle)** | `(0.90, 0.85, 0.15)` | Warm yellow |
| **Color (pulsing)** | `(1.0, 1.0, 0.60)` | Hot white-yellow |
| **Glow (idle)** | `0.8` | |
| **Glow (pulsing)** | `4.0` | Blinding flash |
| **Radius (idle)** | `11` | |
| **Radius (pulsing)** | `35` | Danger zone |
| **HP** | `250` | |
| **Speed** | `50` | Slow drift |
| **Contact Damage (idle)** | `10` | |
| **Contact Damage (pulsing)** | `20` + knockback | The punish |
| **Movement** | Drift toward player → stop → pulse → resume | |
| **Death** | Implosion: particles rush inward then burst | |
| **First Appears** | 5:00 (Wave 10) | |
| **XP Value** | `4` | |

```rust
enum PulsarState {
    Drift { timer: f32 },   // Move toward player for 2.5s
    Swell { timer: f32 },   // Expand radius over 0.5s (telegraph)
    Pulse { timer: f32 },   // Hold expanded for 0.3s (damage)
    Shrink { timer: f32 },  // Contract over 0.3s
}

// Drift (2.5s) → Swell (0.5s) → Pulse (0.3s) → Shrink (0.3s) → Drift
// Total cycle: 3.6s
// During Swell, radius lerps from 11 → 35 (this IS the telegraph)
// During Pulse, radius = 35, damage active
// During Shrink, radius lerps from 35 → 11
```

**Design intent:** The Swell phase is the spatial read — when you see a yellow circle growing, move away. Pulsars combined with Orbiters create "no-go zones" inside the orbit cage, forcing the player into tighter corridors. The pulse rhythm creates predictable danger that skilled players can weave through.

**Scaling:** HP gains +30/min. Pulse radius gains +3/min (max 55 at minute 11.7, but session ends at 10).

---

### 1.7 Wraith (Late-Game Threat)

Partially invisible. Fades to near-transparent, visible only by its glow aura. Moves fast, phases through other enemies. The "where is it?" enemy that forces awareness.

| Stat | Value | Notes |
|------|-------|-------|
| **Color** | `(0.50, 0.20, 0.70)` | Deep violet |
| **Glow** | `2.5` → oscillates to `0.3` | The only real visibility cue |
| **Alpha** | Oscillates `0.15 ↔ 0.8` over 2s | Mostly invisible |
| **Radius** | `8` | |
| **HP** | `120` | |
| **Speed** | `100` | 1.4× drone |
| **Contact Damage** | `18` | High — punishes inattention |
| **Movement** | Drift toward player, sinusoidal weave | |
| **Death** | Purple implosion + brief dark flash | |
| **First Appears** | 7:00 (Wave 14) | Late-game only |
| **XP Value** | `3` | |

```rust
// Visibility oscillation (used for rendering alpha and glow):
let phase = (self.time * PI).sin() * 0.5 + 0.5; // 0..1 over ~2s
let alpha = lerp(0.15, 0.8, phase);
let glow = lerp(0.3, 2.5, phase);

// Movement: drift + perpendicular weave
let to_player = (player_pos - self.pos).normalize_or_zero();
let perp = Vec2::new(-to_player.y, to_player.x);
let weave = (self.time * 3.0).sin() * 40.0; // ±40px lateral
self.pos += (to_player * self.speed + perp * weave) * dt;
```

**Design intent:** Wraiths are the "attention tax." In the late game when the screen is full of enemies, Wraiths slip through the chaos. Their oscillating visibility means they're sometimes readable and sometimes nearly invisible. Interference shard (expanding rings) hard-counters them since it doesn't require visual targeting. Halo also catches them in close range.

**Scaling:** HP gains +15/min. Alpha minimum rises to 0.25 at minute 9 (slight mercy).

---

## 2. Enemy Visual Identity Summary

All enemies are readable at a glance via color + size:

```
 SMALL ──────────────────────────── LARGE
  ╭──────────────────────────────────╮
  │  Dasher(7)  Wraith(8)  Drone(9)  │  ← Kill fast
  │      Orbiter(10)  Pulsar(11)     │  ← Medium threat
  │          Splitter(14)            │  ← Kill = spawn more
  │              Brute(22)           │  ← Tank / wall
  ╰──────────────────────────────────╯

 COLOR MAP:
  Cyan .... Dasher    (speed threat)
  Purple .. Drone     (swarm filler)
  Violet .. Wraith    (stealth threat)
  Green ... Splitter  (split mechanic)
  Orange .. Orbiter   (spatial denial)
  Yellow .. Pulsar    (area denial)
  Red ..... Brute     (tank / wall)
```

**Glow intensity = threat urgency:**
- `0.3–0.8`: Background threat (Drone, Wraith faded, Splinter)
- `1.0–1.5`: Active threat (Brute, Orbiter, Splitter, Pulsar idle)
- `2.0–4.0`: Immediate danger (Dasher charging, Pulsar pulsing, Wraith visible, Boss)

---

## 3. Wave System (10-Minute Session)

### 3.1 Structure

The session is divided into **20 waves**, each 30 seconds long. Waves have a **composition** (which enemy types spawn) and a **density** (how many per second). Between waves: a 2-second spawn pause (breathing room).

```
Minute │ Waves │ Theme              │ New Enemy
───────┼───────┼────────────────────┼──────────
 0:00  │ 1-2   │ Tutorial           │ Drone
 1:00  │ 3-4   │ Building pressure  │ —
 1:30  │ —     │ First Brute        │ Brute
 2:00  │ 5-6   │ Speed check        │ Dasher
 3:00  │ 7-8   │ ★ BOSS 1           │ Prism Sentinel
 4:00  │ 9-10  │ New threat intro    │ Orbiter
 5:00  │ 11-12 │ Area denial        │ Pulsar
 6:00  │ 13-14 │ ★ BOSS 2           │ Chromatic Hydra
 7:00  │ 15-16 │ Full roster        │ Wraith
 8:00  │ 17-18 │ Everything at once  │ —
 9:00  │ 19-20 │ ★ ONSLAUGHT + BOSS │ Void Prism (final)
```

### 3.2 Wave Composition Table

Each wave defines spawn rates per enemy type (enemies/second). `—` = not spawning.

| Wave | Time | Drone | Brute | Dasher | Splitter | Orbiter | Pulsar | Wraith | Notes |
|------|------|-------|-------|--------|----------|---------|--------|--------|-------|
| 1 | 0:00 | 1.5 | — | — | — | — | — | — | Learn to move |
| 2 | 0:30 | 2.0 | — | — | — | — | — | — | Beams shred |
| 3 | 1:00 | 2.5 | — | — | — | — | — | — | Density ramp |
| 4 | 1:30 | 2.0 | 0.15 | — | — | — | — | — | First Brute |
| 5 | 2:00 | 2.5 | 0.15 | 0.3 | — | — | — | — | Dashers join |
| 6 | 2:30 | 3.0 | 0.2 | 0.4 | — | — | — | — | Pre-boss ramp |
| 7 | 3:00 | 1.0 | — | — | — | — | — | — | **BOSS 1** (reduced spawns) |
| 8 | 3:30 | 2.0 | 0.1 | 0.2 | 0.2 | — | — | — | Post-boss + Splitters |
| 9 | 4:00 | 3.0 | 0.2 | 0.3 | 0.3 | 0.2 | — | — | Orbiters join |
| 10 | 4:30 | 3.5 | 0.25 | 0.4 | 0.3 | 0.3 | — | — | Cage forming |
| 11 | 5:00 | 3.0 | 0.2 | 0.3 | 0.2 | 0.2 | 0.15 | — | Pulsars join |
| 12 | 5:30 | 3.5 | 0.3 | 0.5 | 0.3 | 0.3 | 0.2 | — | Multi-threat |
| 13 | 6:00 | 1.5 | — | — | — | — | — | — | **BOSS 2** (reduced) |
| 14 | 6:30 | 3.5 | 0.3 | 0.4 | 0.3 | 0.3 | 0.2 | — | Post-boss surge |
| 15 | 7:00 | 4.0 | 0.3 | 0.5 | 0.4 | 0.3 | 0.25 | 0.15 | Wraiths join |
| 16 | 7:30 | 4.5 | 0.35 | 0.6 | 0.4 | 0.4 | 0.3 | 0.2 | Full roster |
| 17 | 8:00 | 5.0 | 0.4 | 0.7 | 0.5 | 0.4 | 0.3 | 0.25 | Peak density |
| 18 | 8:30 | 5.5 | 0.45 | 0.8 | 0.5 | 0.5 | 0.35 | 0.3 | Maximum |
| 19 | 9:00 | 3.0 | 0.2 | 0.3 | 0.2 | 0.2 | 0.15 | 0.15 | **FINAL BOSS** |
| 20 | 9:30 | 8.0 | 0.5 | 1.0 | 0.6 | 0.5 | 0.4 | 0.4 | **ONSLAUGHT** |

### 3.3 HP Scaling Formula

All enemy HP scales linearly with elapsed minutes:

```rust
fn scaled_hp(base_hp: f32, hp_per_min: f32, game_time: f32) -> f32 {
    base_hp + hp_per_min * (game_time / 60.0)
}
```

| Type | Base HP | +HP/min | HP at min 5 | HP at min 9 |
|------|---------|---------|-------------|-------------|
| Drone | 80 | 15 | 155 | 215 |
| Brute | 600 | 80 | 1000 | 1200 |
| Dasher | 60 | 10 | 110 | 150 |
| Splitter | 200 | 30 | 350 | 470 |
| Splinter | 30 | 5 | 55 | 75 |
| Orbiter | 150 | 20 | 250 | 330 |
| Pulsar | 250 | 30 | 400 | 520 |
| Wraith | 120 | 15 | 195 | 255 |

### 3.4 Pacing Chart

```
Tension
  ▲
5 │                              ██        ████████████
4 │                    ████   ██  ██      ██          ██
3 │          ████   ██    ██ █  ██  ██  ██          ONSLAUGHT
2 │  ██████ █  ████ █      ██        ████
1 │██      █
0 │────────────────────────────────────────────────────▶ Time
  0   1   2   3   4   5   6   7   8   9   10 min
      │       │           │           │       │
      │       BOSS1       BOSS2      Full    BOSS3
      Brute              Roster    + Onslaught
```

**Tension beats:**
- **0:00–1:00** — Low. Tutorial. Player learns beam auto-fire, movement.
- **1:00–2:00** — Rising. Brute arrival forces decision-making.
- **2:00–3:00** — Medium. Dashers add reflex requirement.
- **3:00–3:30** — **SPIKE.** Boss 1. Screen clears of most adds.
- **3:30–4:00** — Release. Post-boss breather + splitter intro (gentle).
- **4:00–5:00** — Rising. Orbiter cages + dasher crossfire.
- **5:00–6:00** — High. Pulsars create no-go zones inside orbiter rings.
- **6:00–6:30** — **SPIKE.** Boss 2.
- **6:30–7:00** — Brief release, then rapid ramp.
- **7:00–9:00** — Sustained high. Full roster, escalating counts.
- **9:00–10:00** — **MAXIMUM.** Final boss + onslaught. Do or die.

---

## 4. Boss Design (3 Bosses)

### 4.1 Boss 1 — Prism Sentinel (Minute 3:00)

**Fantasy:** A massive, slow predator that forces the player to respect space for the first time.

| Stat | Value |
|------|-------|
| **Color** | Phase-dependent (see below) |
| **Glow** | `3.5` |
| **Radius** | `45` (5× drone) |
| **HP** | `3000` |
| **Speed** | `30` |
| **Contact Damage** | `35` |
| **Duration** | Up to 30s (despawns if not killed — retreats off screen) |

**Phases (HP thresholds):**

| Phase | HP Range | Color | Radius | Behavior |
|-------|----------|-------|--------|----------|
| **1** | 100–60% | `(1.0, 1.0, 1.0)` white | 45 | Drift toward player. Spawns 2 Drones every 3s from its surface. |
| **2** | 60–30% | `(1.0, 0.5, 0.2)` orange | 50 | Faster (speed=45). Spawns 1 Dasher every 4s. Glow pulses (2.5↔4.5). |
| **3** | 30–0% | `(1.0, 0.15, 0.15)` red | 55 | Speed=55. Spawns 3 Drones every 2s. Radius pulses ±5 (menacing throb). |

**Death:** Massive explosion — 40 particles in all colors, 12px screen shake, all spawned adds die instantly.

```rust
// Phase transition visual: radius lerps over 0.5s
// Glow pulse in phase 2: glow = 3.5 + 1.0 * sin(time * 4.0)
// Radius pulse in phase 3: radius = 55.0 + 5.0 * sin(time * 6.0)
```

**Why it feels like a boss:**
1. **Size dominance** — 45–55px radius dwarfs everything. It IS the encounter.
2. **Phase-color transitions** — white → orange → red reads as escalating danger.
3. **Add spawning** — creates micro-encounters around the macro-threat.
4. **Glow intensity** — at 3.5+ glow, it visually dominates the bloom pass.
5. **Screen shake on death** — the payoff.

**Spawn:** Appears from top of screen, slow approach. 2-second warning: a bright white circle expands from r=0 to r=45 at spawn point (telegraph).

---

### 4.2 Boss 2 — Chromatic Hydra (Minute 6:00)

**Fantasy:** A multi-body boss. Three linked circles that must all be destroyed. Killing one makes the others stronger. The player must choose: focus fire or spread damage?

**Core Body (×3):**

| Stat | Per Head |
|------|----------|
| **Radius** | `28` |
| **HP** | `1800` each (5400 total) |
| **Speed** | `40` |
| **Contact Damage** | `20` |
| **Glow** | `2.8` |

**Each head has a distinct color and behavior:**

| Head | Color | Behavior When Alive | On-Death Buff to Survivors |
|------|-------|--------------------|-----------------------------|
| **Red** | `(1.0, 0.2, 0.15)` | Charges toward player every 4s (speed burst to 180 for 0.6s) | Survivors gain +30% speed |
| **Green** | `(0.2, 0.9, 0.3)` | Spawns 2 Splinters every 3s | Survivors gain +40% HP |
| **Blue** | `(0.2, 0.4, 1.0)` | Creates Orbiter-style ring (orbits at 120px from player) | Survivors gain +50% damage |

**Formation:** The three heads maintain a triangle formation (100px apart), centered on their group centroid, which drifts toward the player at 40 speed. Each head orbits the centroid at 0.5 rad/s.

```rust
struct HydraHead {
    color: [f32; 3],
    hp: f32,
    angle: f32,        // orbit angle around centroid
    alive: bool,
    buff_applied: bool,
}

// Centroid moves toward player
// Each alive head: pos = centroid + Vec2(angle.cos(), angle.sin()) * 100
// Dead heads: stop rendering, apply buff to survivors
```

**Death (all heads):** Sequential implosion — each head contracts to point over 0.3s in sequence, then combined explosion (50 particles, all three colors).

**Why it works with SDF circles:**
- Three large circles in formation are instantly readable as "one boss entity"
- Color-coding (R/G/B) gives each head identity
- The triangle rotation creates visual complexity from simple math
- Kill-order decision creates strategic depth

---

### 4.3 Boss 3 — Void Prism (Minute 9:00, Final)

**Fantasy:** The inversion of everything. A dark void that absorbs light. Visually distinct from every other entity — low glow, dark color, massive.

| Stat | Value |
|------|-------|
| **Color** | `(0.08, 0.02, 0.12)` — near-black with purple tinge |
| **Glow** | `0.4` (anti-glow — dark hole in the bloom) |
| **Border glow** | `5.0` — bright white edge ring (rendered as second circle, slightly larger) |
| **Radius** | `60` → grows to `80` over fight |
| **HP** | `8000` |
| **Speed** | `25` |
| **Contact Damage** | `50` |
| **Duration** | Must be killed to win. No despawn. |

**Phases:**

| Phase | HP | Radius | Mechanic |
|-------|-----|--------|----------|
| **1** (100–70%) | 8000–5600 | 60 | **Gravity well:** All enemies within 200px are pulled toward the Void at 30 speed. Creates clustering. Player is NOT pulled. |
| **2** (70–40%) | 5600–3200 | 70 | **Shockwave:** Every 5s, emits a ring (like Interference) at 300px radius. Ring deals 15 damage on contact. Ring is rendered as a thin bright circle expanding outward. |
| **3** (40–0%) | 3200–0 | 80 | **Singularity:** Speed doubles to 50. Gravity well radius 350px. Shockwave every 3s. Spawns 4 Wraiths every 6s from its surface. |

**Rendering (two circles per frame):**
```rust
// Inner void (dark):
CircleInstance {
    radius: self.radius,
    r: 0.08, g: 0.02, b: 0.12,
    a: 1.0,
    glow: 0.4,  // dark — anti-bloom
}
// Outer edge ring (bright border):
CircleInstance {
    radius: self.radius + 4.0,
    r: 0.9, g: 0.8, b: 1.0,
    a: 0.6,
    glow: 5.0,  // intense edge glow
}
// Shockwave rings (phase 2+):
CircleInstance {
    radius: ring_current_radius,
    r: 0.7, g: 0.5, b: 1.0,
    a: 0.3 * (1.0 - t),
    glow: 2.0 * (1.0 - t),
}
```

**Death:** 
1. Radius contracts from 80 → 0 over 1.5s
2. At radius=0: massive white flash (full-screen circle, alpha 0.8, glow 8.0, expanding to 400px over 0.5s)
3. ALL remaining enemies on screen die instantly (victory clear)
4. 2-second pause → Victory screen

**Why it's the final boss:**
- Visually unique — the only dark entity in a game of glowing lights
- Gravity well creates emergent encounters (enemy clusters)
- Growing radius = shrinking safe space = time pressure
- Three-phase escalation with clear visual reads (size changes)
- Killing it = winning the run

---

## 5. Spawn Patterns

### 5.1 Entry Behaviors

Enemies don't all appear the same way. Spawn pattern variety prevents monotony:

| Pattern | Description | Used By | Implementation |
|---------|-------------|---------|----------------|
| **Ring** | Random point on screen-edge circle, r = screen diagonal × 0.55 | Drone, Brute, Wraith | Current behavior |
| **Burst Group** | 3-6 enemies at same edge point, 15px apart | Drone, Splitter | Same angle, offset positions |
| **Pincer** | 2 groups spawn at opposite edges simultaneously | Dasher | angle and angle + π |
| **Formation** | Line of 4-6 enemies, evenly spaced along edge segment | Orbiter | angle + i×0.15 rad |
| **Boss Telegraph** | Bright expanding circle at spawn point for 2s before arrival | Bosses | Pre-spawn marker circle |
| **Cluster Drop** | 5-8 enemies appear in a cluster ~400px from player | Drone (wave 17+) | Random angle, fixed distance, spread ±30px |

### 5.2 Spawn Pattern Scheduling

```rust
enum SpawnPattern {
    Single,                 // 1 enemy, random edge
    BurstGroup(u8),         // N enemies, same point
    Pincer(u8),             // N enemies each side, 2 groups
    Formation(u8),          // N enemies in line
    ClusterDrop(u8),        // N enemies near player
}

// Wave-level spawn events (in addition to continuous per-second rates):
struct WaveEvent {
    time_in_wave: f32,       // seconds into this wave
    pattern: SpawnPattern,
    enemy_type: EnemyType,
}
```

| Wave | Special Spawn Events |
|------|---------------------|
| 4 | `t=5s: BurstGroup(4) Drone` — first "oh no" moment |
| 5 | `t=0s: Pincer(2) Dasher` — dashers from both sides |
| 7 | `t=0s: BossTelegraph(Sentinel)` |
| 9 | `t=10s: Formation(4) Orbiter` — cage setup |
| 11 | `t=15s: Single Pulsar + BurstGroup(6) Drone` — combo pressure |
| 13 | `t=0s: BossTelegraph(Hydra)` |
| 15 | `t=5s: Pincer(3) Dasher + Formation(3) Orbiter` — cross-fire cage |
| 17 | `t=0s: ClusterDrop(8) Drone` — panic spawn |
| 19 | `t=0s: BossTelegraph(VoidPrism)` |
| 20 | `t=0s: ClusterDrop(10) Drone, t=5s: BurstGroup(4) Splitter, t=10s: Pincer(4) Dasher` |

### 5.3 Pressure Without Unfairness — Design Rules

These invariants must hold at all times:

1. **No off-screen damage.** Enemies must be on-screen for ≥0.3s before they can deal contact damage. New spawns get a 0.3s grace period where they drift but deal 0 damage.
2. **No instant-surround.** ClusterDrop spawns at minimum 400px from player — enough distance for 1-2 beam volleys before contact.
3. **Boss spawn clears adds.** When a boss spawns, current enemy count is soft-capped: if >30 enemies alive, stop continuous spawning until count drops below 20.
4. **Dasher telegraph is sacred.** The 0.6s wind-up glow MUST play before any charge. No "instant charge on spawn."
5. **Pulsar first pulse is delayed.** Newly spawned Pulsars start in Drift state (2.5s before first pulse), giving the player time to see and react.
6. **Maximum enemy count: 200.** Hard cap. If at 200, stop spawning until kills bring count down. Prevents GPU/CPU overload.
7. **Post-boss breather.** After a boss dies, 3 seconds of no spawning. Then reduced-rate wave resumes.

---

## 6. Rust Implementation Sketch

### 6.1 Enemy Enum

```rust
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EnemyType {
    Drone,
    Brute,
    Dasher,
    Splitter,
    Splinter,
    Orbiter,
    Pulsar,
    Wraith,
}
```

### 6.2 Expanded Enemy Struct

```rust
pub struct Enemy {
    pub pos: Vec2,
    pub radius: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub speed: f32,
    pub contact_damage: f32,
    pub enemy_type: EnemyType,
    pub color: [f32; 3],
    pub glow: f32,
    pub xp_value: u32,
    pub state: EnemyState,
    pub spawn_grace: f32,       // 0.3s no-damage on spawn
    pub state_timer: f32,       // generic timer for state machines
    pub state_dir: Vec2,        // locked direction (Dasher charge, Splinter burst)
}

pub enum EnemyState {
    // Drone, Brute, Splitter: no states needed, always drift
    Drift,
    // Dasher
    DasherWindUp,
    DasherCharge,
    DasherCooldown,
    // Orbiter
    OrbiterApproach,
    OrbiterOrbiting { angle: f32 },
    // Pulsar
    PulsarDrift,
    PulsarSwell,
    PulsarPulse,
    PulsarShrink,
    // Wraith: always Drift, visibility is computed from time
    // Splinter
    SplinterBurst,
}
```

### 6.3 Wave Controller

```rust
pub struct WaveController {
    pub wave_index: u8,            // 0–19
    pub wave_timer: f32,           // counts down from 30.0
    pub game_timer: f32,           // counts up from 0.0 (total elapsed)
    pub inter_wave_pause: f32,     // 2.0s between waves
    pub boss_active: bool,
    pub spawn_accumulators: [f32; 8], // per-type fractional spawn tracking
}

impl WaveController {
    pub fn update(&mut self, dt: f32) -> Vec<SpawnCommand> {
        self.game_timer += dt;
        
        if self.inter_wave_pause > 0.0 {
            self.inter_wave_pause -= dt;
            return vec![];
        }
        
        self.wave_timer -= dt;
        if self.wave_timer <= 0.0 {
            self.wave_index = (self.wave_index + 1).min(19);
            self.wave_timer = 30.0;
            self.inter_wave_pause = 2.0;
            return vec![];
        }
        
        // Accumulate fractional spawns per type
        let rates = WAVE_TABLE[self.wave_index as usize];
        let mut commands = vec![];
        for (i, rate) in rates.iter().enumerate() {
            if *rate > 0.0 {
                self.spawn_accumulators[i] += rate * dt;
                while self.spawn_accumulators[i] >= 1.0 {
                    self.spawn_accumulators[i] -= 1.0;
                    commands.push(SpawnCommand {
                        enemy_type: EnemyType::from_index(i),
                        pattern: SpawnPattern::Single,
                    });
                }
            }
        }
        commands
    }
}
```

### 6.4 Death Behavior Dispatch

```rust
fn on_enemy_death(&mut self, enemy: &Enemy, cascade_depth: u32) {
    self.kills_total += 1;
    self.xp += enemy.xp_value;
    
    match enemy.enemy_type {
        EnemyType::Splitter => {
            // Spawn 3 Splinters
            let base_angle = self.rng.angle();
            for i in 0..3 {
                let angle = base_angle + (i as f32) * TAU / 3.0;
                let dir = Vec2::new(angle.cos(), angle.sin());
                let pos = enemy.pos + dir * 18.0;
                self.spawn_splinter(pos, dir);
            }
            self.spawn_death_particles(enemy.pos, enemy.color, 15);
        }
        EnemyType::Brute => {
            self.spawn_death_particles(enemy.pos, enemy.color, 20);
            self.shake_amount += 6.0; // big shake
        }
        EnemyType::Pulsar => {
            // Implosion then burst
            self.spawn_implosion_particles(enemy.pos, enemy.color, 12);
        }
        _ => {
            self.spawn_death_particles(enemy.pos, enemy.color, PARTICLE_COUNT_PER_DEATH);
            self.shake_amount += SHAKE_DEATH_PX;
        }
    }
    
    // Cascade (unchanged logic, works on all types)
    if cascade_depth < CASCADE_MAX_DEPTH {
        // ... existing cascade beam logic ...
    }
}
```

---

## 7. Shard Interaction Matrix

How each shard interacts with the new enemy types (✦ = strong synergy, ✧ = moderate, · = neutral):

| Shard | Drone | Brute | Dasher | Splitter | Orbiter | Pulsar | Wraith |
|-------|-------|-------|--------|----------|---------|--------|--------|
| **Split** | ✦ AoE clears swarms | · | ✧ spread coverage | ✦ hits splinters | ✧ | · | ✧ wider coverage |
| **Refract** | ✧ homing useful in crowds | ✧ guarantees hits | ✦ tracks fast targets | ✧ | ✦ hits orbiting targets | ✧ | ✦ hits despite weave |
| **Mirror** | ✦ radial clears swarms | · | ✧ | ✦ hits splinters | ✦ radial hits orbit ring | ✧ | ✧ |
| **Chromatic** | · | ✧ | · | · | · | · | · |
| **Lens** | · | ✦ high single-target DPS | · | ✧ kills parent faster | · | ✧ | · |
| **Diffract** | ✦ AoE on kill chains | ✧ | · | ✦ kills splinters on impact | · | · | ✧ |
| **Echo** | ✦ double fire rate | ✦ more hits on tank | ✧ | ✧ | ✧ | ✧ | ✧ |
| **Halo** | ✧ close defense | · radius too small | ✦ catches chargers | ✦ kills splinters | · | · | ✦ catches invisible |
| **Cascade** | ✦ chain kills | · | · | ✦ splinter chain kills | · | · | · |
| **Interference** | ✦ ring clears swarms | ✧ sustained DPS | ✧ | ✦ hits splinters | ✧ ring hits orbit | ✦ hits pulsing targets | ✦ no aim needed |

**Build archetypes that emerge:**
- **Swarm Clearer:** Mirror + Split + Cascade — radial beams chain-kill drone waves
- **Boss Killer:** Lens + Echo + Refract — focused high DPS on single targets
- **Area Denial:** Interference + Halo + Diffract — passive damage handles everything close
- **Precision Hunter:** Refract + Lens + Chromatic — homing high-damage beams pick off threats

---

## 8. Win/Lose Conditions

| Condition | Trigger | Result |
|-----------|---------|--------|
| **Victory** | Survive 10:00 OR kill Void Prism | Victory screen, final score, stats |
| **Death** | Player HP ≤ 0 | Death screen, score, "survived X:XX" |
| **Score** | `kills × 10 + rank × 50 + time_survived_seconds + boss_kills × 500` | Higher = better |
| **Timer display** | Top-center of HUD, `MM:SS` format, counts UP | Always visible |

If the Void Prism is killed before 10:00, the session ends immediately in victory. If the player survives to 10:00 without killing the Void Prism, the Void Prism despawns and victory is granted (survival win).

---

## 9. Performance Budget

| Metric | Budget | Rationale |
|--------|--------|-----------|
| Max enemies alive | 200 | Hard cap. At 8 floats × 200 = 1600 floats ≈ 6.4KB circle buffer |
| Max particles | 1024 | Existing cap, sufficient |
| Max beams | 256 | Existing cap |
| Boss extra circles | 3 per boss (void ring, shockwaves) | Negligible |
| State machine overhead | 1 enum + 2 floats per enemy | ~12 bytes extra per enemy |
| Total enemy struct size | ~80 bytes | vs current ~24 bytes — still cache-friendly |

**At 200 enemies:** 200 × 80 bytes = 16KB enemy data. Circle buffer = 200 × 32 bytes = 6.4KB. Well within L1 cache on any modern CPU. Zero rendering overhead increase — same instanced draw call, just more instances.
