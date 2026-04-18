# Prism — Bullet-Heaven Genre Gap Analysis

> **Date:** 2026-04-18  
> **Scope:** Feature-by-feature comparison of Prism against Vampire Survivors, Brotato, HoloCure, 20 Minutes Till Dawn, Halls of Torment, and Soulstone Survivors  
> **Constraint:** Browser WebGL2 + WASM, procedural SDF rendering only, no audio engine, single-file architecture

---

## 1. Gap Analysis Table

### 1.1 Core Loop

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **Session timer** | 10–30 min survival clock (VS: 30, Brotato: ~5, HoloCure: 20) | ❌ None — infinite with no endpoint | 🔴 CRITICAL |
| **Wave system** | Escalating phases with density spikes, boss waves | ❌ Linear spawn rate decay only | 🔴 CRITICAL |
| **XP gems / pickups** | Enemies drop collectible XP gems that magnetize to player | ❌ XP auto-granted on kill (no pickup) | 🟠 HIGH |
| **Difficulty curve** | Multi-axis scaling: enemy HP, speed, count, type mix, elite % | ⚠️ Spawn rate only | 🟠 HIGH |
| **Boss encounters** | Timed miniboss (every 2–5 min) + final boss | ❌ None | 🟠 HIGH |
| **Win condition** | Survive the timer OR defeat final boss | ❌ None — play until death | 🟠 HIGH |

### 1.2 Enemy Design

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **Enemy types** | 8–15+ types (swarm, tank, ranged, dash, explode, split) | ❌ 1 type (purple blob, HP=100, drift) | 🔴 CRITICAL |
| **Enemy HP scaling** | HP increases with time/wave (e.g., 50→500 over 10 min) | ❌ Fixed HP=100 forever | 🟠 HIGH |
| **Enemy speed variety** | Slow tanks, fast rushers, teleporters, flankers | ⚠️ Random ±15% of base only | 🟠 HIGH |
| **Elite/champion enemies** | Larger, HP×5–10, unique color, drops better loot | ❌ None | 🟡 MEDIUM |
| **Enemy spawn patterns** | Clusters, flanking, ring spawns, corridor spawns | ⚠️ Uniform random ring only | 🟡 MEDIUM |
| **Enemy projectiles** | Ranged enemies fire at player (Halls of Torment, Soulstone) | ❌ None — contact only | 🟡 MEDIUM |
| **Enemy death effects** | Corpse fade, blood/slime, unique death anims per type | ⚠️ Particles only, 1 color | 🟡 MEDIUM |

### 1.3 Player & Weapons

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **Multiple weapon types** | 4–10 base weapons, each with unique behavior | ⚠️ 1 weapon (beam), modified by shards | 🟡 MEDIUM |
| **Weapon evolution** | Combine maxed weapons → new super weapon (VS, HoloCure) | ❌ None (max shard level = 5, no combos) | 🟡 MEDIUM |
| **Player character variety** | Multiple characters with different starting weapons/stats | ❌ 1 character | 🟡 MEDIUM |
| **Passive items** | HP regen, armor, magnet range, luck, cooldown, movespeed | ⚠️ Shards are purely offensive | 🟠 HIGH |
| **Heal/recovery** | Floor pickups, level-up heal, passive regen | ❌ No healing at all | 🟠 HIGH |
| **Dash/dodge** | Active dodge with i-frames (20MTD, Brotato) | ❌ None — movement only | 🟡 MEDIUM |

### 1.4 Progression & Economy

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **XP gem pickup** | Physical gems on ground, magnetize at radius, satisfaction loop | ❌ Instant XP on kill | 🟠 HIGH |
| **Gold/currency** | Persistent currency for meta-unlocks between runs | ❌ None | 🟡 MEDIUM |
| **Meta-progression** | Permanent stat upgrades between runs (VS: PowerUp shop) | ❌ None — every run identical | 🟡 MEDIUM |
| **Chest/treasure drops** | Random chest spawns with bonus items at intervals | ❌ None | 🟡 MEDIUM |
| **Luck stat** | Affects drop rates, rarity, reroll quality | ❌ None | 🟢 LOW |
| **Reroll/banish** | Skip or lock-out unwanted upgrades | ❌ Must pick 1 of 3 | 🟢 LOW |

### 1.5 Visual Feedback & Juice

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **Damage numbers** | Floating numbers per hit, color-coded by type | ❌ None | 🟠 HIGH |
| **Kill streak / combo** | Visual indicator for consecutive kills (×10, ×50) | ❌ None | 🟡 MEDIUM |
| **XP pickup flash** | Bright flash + particle trail when gems magnetize in | ❌ No gems exist | 🟡 MEDIUM |
| **Level-up fanfare** | Full-screen flash, particle burst, text callout | ⚠️ Overlay modal only, no visual punch | 🟡 MEDIUM |
| **Enemy spawn telegraph** | Warning circle/shadow before enemy appears | ❌ Enemies pop in silently off-screen | 🟢 LOW |
| **Screen flash on big kills** | Brief white/color flash overlay on multi-kills | ❌ None | 🟡 MEDIUM |
| **Hit stop / freeze frame** | 1–3 frame pause on significant hits (bosses, crits) | ❌ None | 🟡 MEDIUM |
| **Background parallax/grid** | Moving starfield, grid lines, terrain markers | ❌ Solid dark background — no spatial reference | 🟠 HIGH |
| **Minimap** | Small radar showing enemy density / direction | ❌ None | 🟢 LOW |
| **Player trail** | Motion trail / afterimage behind player | ❌ None | 🟢 LOW |

### 1.6 HUD & UX

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **Timer display** | Large countdown or elapsed timer | ❌ None | 🟠 HIGH |
| **Kill counter** | Visible kill count in HUD | ✅ Present (top-right) | ✅ DONE |
| **Active weapon display** | Icons for each active weapon/ability + cooldown | ⚠️ Shard pips exist but no cooldown info | 🟡 MEDIUM |
| **Pause menu** | ESC to pause with resume/quit options | ❌ None (level-up pauses only) | 🟡 MEDIUM |
| **Stats screen (post-run)** | Kills, damage dealt, time survived, DPS, shards collected | ⚠️ Score only — no breakdown | 🟡 MEDIUM |
| **High score table** | localStorage persisted top scores | ❌ None | 🟡 MEDIUM |

### 1.7 Environment & World

| Feature | Genre Standard | Prism Current | Gap Severity |
|---------|---------------|---------------|--------------|
| **Ground reference** | Grid, tiles, terrain, or at minimum scroll-parallax dots | ❌ Pure black void | 🟠 HIGH |
| **Destructible props** | Breakable objects that drop XP/items | ❌ None | 🟢 LOW |
| **Map boundaries** | Visible walls or looping world edge | ❌ Infinite void | 🟢 LOW |
| **Environmental hazards** | Lava, spikes, poison zones | ❌ None | 🟢 LOW |
| **Stage variety** | Multiple biomes or tileset swaps | ❌ None | 🟢 LOW |

---

## 2. Prioritized Changes

### IMMEDIATE — High Impact, Low Effort (1–2 days each)

These changes are tuning, constants, and small visual additions — no architectural changes.

| # | Change | Impact | Effort | Details |
|---|--------|--------|--------|---------|
| **I-1** | **Background grid** | ★★★★★ | ~30 LOC | Add a faint SDF grid pattern in the fragment shader. Gives spatial reference, makes movement feel real. Use `fract(worldPos / gridSize)` with gridSize=64px, draw lines at 0.04 alpha. |
| **I-2** | **Damage numbers** | ★★★★★ | ~60 LOC | On enemy hit, spawn a floating text particle: white number (e.g., "100") that drifts up and fades over 0.6s. Render as instanced quads with digit atlas (SDF digits 0–9). |
| **I-3** | **XP gems (drop + magnetize)** | ★★★★★ | ~80 LOC | Kill → spawn green circle (r=4) at death pos. Gems drift, then magnetize to player within 60px at 400px/s. Pickup → XP + brief flash. This is the #1 missing satisfaction loop. |
| **I-4** | **Session timer (10 min)** | ★★★★ | ~40 LOC | Add elapsed timer, display MM:SS top-center. At 10:00 → "SURVIVED" win screen. Gives runs an endpoint. |
| **I-5** | **Enemy HP scaling** | ★★★★ | ~10 LOC | `enemy_hp = ENEMY_HP + time * 8.0`. At 5 min, HP=2500. Forces shard upgrades to matter. |
| **I-6** | **Kill streak counter** | ★★★ | ~30 LOC | Track kills within 1.5s window. Display "×5" "×10" "×25" as HUD text that grows/fades. At ×25: brief screen flash. |
| **I-7** | **Level-up screen flash** | ★★★ | ~10 LOC | On rank-up: set a `flash_timer = 0.15`. Render a fullscreen white quad at 0.25 alpha, fading out. Free dopamine hit. |
| **I-8** | **Player trail** | ★★ | ~25 LOC | Every 3 frames, spawn a fading circle at player pos (alpha 0.15, decay over 0.3s). Creates motion afterimage. |
| **I-9** | **Hit-stop on big kills** | ★★ | ~15 LOC | When ≥5 enemies die in a single frame: set `dt_scale = 0.1` for next 2 frames. Micro-freeze sells impact. |

### CORE — High Impact, Medium Effort (3–7 days each)

These require new entity types, state machines, or systems.

| # | Change | Impact | Effort | Details |
|---|--------|--------|--------|---------|
| **C-1** | **Enemy variety (5 types)** | ★★★★★ | ~200 LOC | See §3 below for full type specs. Minimum viable set: Swarm, Tank, Dasher, Splitter, Ranged. Each needs distinct color, size, speed, behavior, and death effect. |
| **C-2** | **Wave system** | ★★★★★ | ~120 LOC | Replace linear spawn decay with wave phases. Each wave: 30s duration, density ramp, type mix table, rest gap. Every 5th wave = boss wave. See §3.2. |
| **C-3** | **Defensive shards (3 types)** | ★★★★ | ~100 LOC | Add: **Shield** (absorb 1 hit/30s), **Regen** (2 HP/s per level), **Magnet** (+40px gem range per level). Fill the "passive items" gap that every genre competitor has. |
| **C-4** | **Boss enemy** | ★★★★ | ~150 LOC | Large circle (radius 40), HP=3000 + 500×wave. Slow, spawns minion ring on damage thresholds. Death = XP explosion + guaranteed shard selection. Appears at minutes 3, 6, 9. |
| **C-5** | **Heal on level-up** | ★★★ | ~5 LOC | `self.player.hp = (self.player.hp + 20.0).min(self.player.max_hp)` in `check_for_level_up`. Standard in every competitor. |
| **C-6** | **Chest drops** | ★★★ | ~60 LOC | Every 60s, spawn a gold circle at random position 200–400px from player. Walk into it → bonus shard choice. Adds spatial goals to the arena. |
| **C-7** | **High score persistence** | ★★★ | ~30 LOC JS | `localStorage.setItem("prism_scores", JSON.stringify(scores))`. Display top 5 on death screen. |
| **C-8** | **Pause menu** | ★★★ | ~40 LOC | ESC → set `paused = true` → update returns early. Display overlay with RESUME / RESTART. |

### POLISH — Medium Impact, Medium Effort (3–5 days each)

| # | Change | Impact | Effort | Details |
|---|--------|--------|--------|---------|
| **P-1** | **Enemy spawn telegraph** | ★★★ | ~40 LOC | 0.5s before spawn, show a faint red circle at spawn position (growing from 0 to enemy radius). Warns the player, prevents unfair offscreen hits. |
| **P-2** | **Post-run stats screen** | ★★★ | ~60 LOC JS | On death/win: show kills, time survived, peak kill streak, shards collected, DPS estimate. |
| **P-3** | **Shard evolution combos** | ★★ | ~100 LOC | When 2 specific shards hit max level → fuse into super shard. E.g., Split 5 + Mirror 5 → "Kaleidoscope" (8 beams that reflect). Creates long-term build goals. |
| **P-4** | **Dash ability** | ★★ | ~60 LOC | Spacebar → 200px instant dash with 0.15s i-frames, 3s cooldown. Adds a second player verb. Display cooldown as ring around player. |
| **P-5** | **Difficulty modes** | ★★ | ~30 LOC | Normal / Hard / Nightmare: multiply enemy HP, speed, and spawn rate by 1.0 / 1.5 / 2.0. |
| **P-6** | **Meta-progression** | ★★ | ~80 LOC | Earn "prismatic shards" on run end (= score / 100). Spend on permanent +5% damage, +10 HP, +5% speed. Persisted to localStorage. Gives reason to replay. |

---

## 3. Specific Number Recommendations

### 3.1 Enemy Type Specifications

| Type | Radius | Color (RGB) | HP (base) | Speed | Behavior | Spawn After | SDF Shape |
|------|--------|-------------|-----------|-------|----------|-------------|-----------|
| **Swarm** | 6 | (0.4, 0.2, 0.6) | 50 | 95 | Beeline, spawns in packs of 5 | 0:00 | Circle |
| **Tank** | 18 | (0.5, 0.15, 0.4) | 500 | 40 | Slow advance, knockback resistant | 1:00 | Circle, thick outline |
| **Dasher** | 7 | (0.8, 0.2, 0.3) | 80 | 55→250 | Walks slowly, charges at 250px/s for 0.4s every 3s | 2:00 | Circle, red glow |
| **Splitter** | 14 | (0.3, 0.5, 0.3) | 200 | 60 | On death, spawns 3 mini (r=5, hp=40, speed=110) | 3:00 | Circle, green tint |
| **Ranged** | 10 | (0.6, 0.3, 0.15) | 120 | 50 | Stops at 200px range, fires slow projectile (r=3, 8dmg) every 2s | 5:00 | Circle, orange |

**HP scaling formula:** `base_hp × (1.0 + elapsed_minutes × 0.3)`  
At minute 10: Swarm=200, Tank=2000, Dasher=320

### 3.2 Wave System

```
Wave Duration: 30 seconds
Rest Between Waves: 3 seconds (no spawns, particles settle)
Wave N enemy budget: 15 + N × 8

Type Mix by Wave:
  Wave 1–3:   Swarm 100%
  Wave 4–6:   Swarm 70%, Tank 20%, Dasher 10%
  Wave 7–9:   Swarm 50%, Tank 15%, Dasher 15%, Splitter 20%
  Wave 10–12: Swarm 40%, Tank 15%, Dasher 15%, Splitter 15%, Ranged 15%
  Wave 13+:   All types, elite chance = 5% + (wave - 12) × 2%

Boss Waves: 5, 10, 15, 20 (boss + reduced normal spawns)

Elite multiplier: HP ×5, radius ×1.5, speed ×0.8, drops 10× XP gems
```

### 3.3 XP Gem Values

| Source | XP Value | Gem Color | Gem Radius |
|--------|----------|-----------|------------|
| Swarm kill | 1 | Green (0.3, 0.9, 0.4) | 3 |
| Tank kill | 5 | Green | 5 |
| Dasher kill | 2 | Green | 3 |
| Splitter kill | 3 | Green | 4 |
| Ranged kill | 3 | Green | 4 |
| Elite kill | 15 | Blue (0.3, 0.5, 1.0) | 6 |
| Boss kill | 50 | Gold (1.0, 0.85, 0.3) | 8 |
| Chest | 10 | Gold | 7 |

**Magnetize radius:** 60px base + 40px per Magnet shard level  
**Magnetize speed:** 400 px/s (accelerating)

### 3.4 Revised Core Constants

```rust
// --- PLAYER (keep feel snappy) ---
const PLAYER_SPEED: f32 = 340.0;       // ✅ Good — matches HoloCure/VS feel
const PLAYER_RADIUS: f32 = 6.0;        // ✅ Good — tiny = skillful dodging
const PLAYER_MAX_HP: f32 = 100.0;      // ✅ Good
const IFRAME_DURATION: f32 = 0.5;      // ✅ Good — VS uses 0.5s
const HEAL_ON_LEVELUP: f32 = 20.0;     // 🆕 ADD

// --- ENEMIES (current values are starter wave only) ---
const ENEMY_SPEED_BASE: f32 = 72.0;    // ✅ Good for Swarm type
const ENEMY_RADIUS: f32 = 9.0;         // ❌ CHANGE: per-type (6–18)
const ENEMY_HP: f32 = 100.0;           // ❌ CHANGE: per-type (50–500 base)
const ENEMY_CONTACT_DAMAGE: f32 = 10.0;// ✅ Good — 10 hits to die

// --- BEAMS ---
const BEAM_DAMAGE: f32 = 100.0;        // ❌ CHANGE → 50.0
// Reason: At 100, one-shot kills trivialize everything.
// At 50, Swarm (50hp) still dies in 1 hit, but Tanks (500hp)
// take 10 hits. Forces meaningful shard choices.
const BEAM_COOLDOWN: f32 = 0.20;       // ✅ Good
const BEAM_REACH: f32 = 650.0;         // ⚠️ Consider 450. 650 kills everything
                                        // before it's visible. Reduce to create
                                        // more screen-space pressure.

// --- SPAWNING (replace with wave system) ---
const SPAWN_RATE_INITIAL: f32 = 0.55;  // ✅ Good for wave 1
const SPAWN_RATE_MIN: f32 = 0.09;      // ⚠️ Consider 0.12 — 0.09 is mobile-hostile
const SPAWN_RATE_DECAY: f32 = 0.004;   // ❌ REMOVE — wave system controls density

// --- XP (slower curve for gem-pickup pacing) ---
// Current: xp_for_rank = 8 + (rank-1) * 6
// Proposed: xp_for_rank = 10 + (rank-1) * 8
// Reason: Gems on ground create a collection mini-game.
// Slightly slower ranks = more time in the satisfying
// pickup loop before next decision point.

// --- SESSION ---
const SESSION_DURATION_SECS: f32 = 600.0; // 🆕 10 minutes
const WAVE_DURATION_SECS: f32 = 30.0;     // 🆕
const WAVE_REST_SECS: f32 = 3.0;          // 🆕
```

### 3.5 Damage / DPS Balance Table

At current beam cooldown (0.2s = 5 shots/sec):

| Shard Build | DPS (base) | Time to Kill Tank (500hp) | Time to Kill Boss (3000hp) |
|-------------|-----------|---------------------------|----------------------------|
| No shards | 250 | 2.0s | 12.0s |
| Split 3 | 500 | 1.0s | 6.0s |
| Split 5 + Chromatic 3 | 1500 | 0.33s | 2.0s |
| Full offensive (rank 15) | ~3000 | 0.17s | 1.0s |

**Target feel:** Tanks should take 2–4s at mid-game. Bosses should take 15–30s. Adjust beam damage and enemy HP scaling to hit these.

---

## 4. Visual Feedback Gaps — Detailed Specifications

### 4.1 Missing Juice Effects (ranked by impact)

| Effect | When | Specification | Impact |
|--------|------|---------------|--------|
| **XP gem magnetize** | Gems within magnet radius | Gems accelerate toward player, leave faint trail (spawn 1 particle/frame along path). On pickup: 1-frame bright flash at player. | ★★★★★ |
| **Damage numbers** | Any enemy takes damage | Spawn digit glyphs at hit point. White for normal, yellow for crit. Drift up at 60px/s, fade over 0.5s. Font: SDF rendered 0–9 atlas. | ★★★★★ |
| **Background grid** | Always visible | Faint cyan grid lines (alpha 0.04) at 64px spacing. Scrolls with camera. Single `fract()` call in fragment shader. | ★★★★★ |
| **Level-up flash** | On rank-up | Fullscreen white overlay, alpha 0.25→0, duration 0.15s. XP bar pulses. | ★★★★ |
| **Enemy hit flash** | Enemy takes beam damage | Override enemy color to white for 1 frame (`hit_flash_positions` already tracked — use it). | ★★★★ |
| **Kill streak text** | ≥5 kills in 1.5s window | HUD text "×5" at center-screen, scales up then fades. At ×10: text turns gold. At ×25: brief screen flash. | ★★★ |
| **Boss entrance** | Boss spawns | 1s warning: screen edge pulses red. Boss fades in over 0.5s. Screen shake on full materialize. | ★★★ |
| **Player low-HP vignette** | HP < 30% | Red vignette overlay intensifies as HP drops. Pulse at HP < 15%. | ★★★ |
| **Multi-kill screen flash** | ≥5 enemies die same frame | 1-frame white overlay at alpha 0.15. Already have cascade chain — this sells it. | ★★ |
| **Enemy death particle color** | Per enemy type | Currently all purple. Swarm=purple, Tank=dark red, Dasher=bright red, Splitter=green, Ranged=orange. | ★★ |
| **Spawn telegraph** | 0.5s before spawn | Faint circle at spawn pos, grows from 0→enemy radius over 0.5s. Alpha 0.1. Prevents unfair hits. | ★★ |
| **Player movement trail** | While moving | Spawn fading afterimage circle every 50ms. Alpha 0.1, decay 0.3s. | ★ |

### 4.2 Already Implemented (Good)

| Effect | Status | Notes |
|--------|--------|-------|
| Screen shake (death + hit) | ✅ | Decay rate feels good. Consider making kill shake proportional to enemy size. |
| I-frame blink | ✅ | 16Hz blink — could be slightly faster (20Hz) for more urgency. |
| HP ring around player | ✅ | Color shift red→green is effective. |
| Death particles | ✅ | 10 particles per kill. Good count. Add color variance per enemy type. |
| Beam fade-out | ✅ | Alpha fade over lifetime is clean. |
| Cascade chain beams | ✅ | Orange burst reads well. |
| Shard-colored beams | ✅ | Chromatic RGB, Diffract green, Cascade orange — good visual language. |

---

## 5. Implementation Sequence Recommendation

Based on impact/effort ratio, the optimal build order is:

```
WEEK 1: "Make It a Game"
  I-4  Session timer (10 min)          — Endpoint creates meaning
  I-5  Enemy HP scaling                — Forces build choices  
  C-5  Heal on level-up (+20hp)        — Prevents frustration spiral
  I-1  Background grid                 — Spatial reference
  I-3  XP gems (drop + magnetize)      — #1 missing satisfaction loop
  
WEEK 2: "Make It Feel Good"
  I-2  Damage numbers                  — Visual feedback
  I-6  Kill streak counter             — Combo dopamine
  I-7  Level-up screen flash           — Rank-up punch
  I-9  Hit-stop on big kills           — Weight to combat
  C-7  High score persistence          — Replay motivation
  C-8  Pause menu                      — Basic UX

WEEK 3: "Make It Interesting"
  C-1  Enemy variety (5 types)         — Core depth
  C-2  Wave system                     — Session structure
  C-3  Defensive shards (3 types)      — Build diversity

WEEK 4: "Make It Replayable"
  C-4  Boss enemy                      — Milestone encounters
  C-6  Chest drops                     — Spatial goals
  P-2  Post-run stats screen           — Motivate "one more run"
  P-6  Meta-progression                — Long-term hook
```

---

## 6. What Prism Does BETTER Than Competitors

Not everything is a gap. These are genuine advantages to preserve:

| Strength | Why It Matters |
|----------|----------------|
| **SDF glow aesthetic** | Visually distinct from every pixel-art competitor. The "light physics" theme is coherent and beautiful. Don't add sprites — lean harder into SDF. |
| **Instant browser play** | Zero install. VS/Brotato/HoloCure all require download. This is Prism's distribution moat. |
| **Shard naming theme** | Split, Refract, Mirror, Chromatic, Lens, Diffract, Echo, Halo, Cascade, Interference — all optics terms. Stronger thematic coherence than VS's random item names. |
| **Cascade chain mechanic** | Unique to Prism. Chain-killing via corpse beams is deeply satisfying and creates emergent AOE clearing. Invest in making this feel more dramatic. |
| **Lean codebase** | ~800 LOC Rust + ~300 LOC JS. Competitors are 100K+ LOC. Agility advantage — can iterate faster than any competitor. |
| **Performance headroom** | Instanced SDF rendering can handle 1000+ entities at 60fps. Most competitors chug at 300–400. This enables denser enemy swarms as a differentiator. |

---

## 7. Anti-Patterns to Avoid

| Don't Do This | Why |
|---------------|-----|
| Add pixel art sprites | Breaks the SDF aesthetic that makes Prism visually unique |
| Add complex inventory UI | Browser + touch. Keep shard selection minimal — 3 cards max |
| Add procedural map generation | Infinite arena works for the genre. VS succeeded with flat fields. |
| Add multiplayer | Scope explosion. Stay single-player. |
| Add narrative/dialogue | Genre doesn't need it. Thematic coherence via naming is enough. |
| Reduce beam reach to force melee | Auto-fire at range IS the genre. Players want to watch the fireworks. |
| Copy VS's exact weapon list | Prism's shard system is more coherent. Expand within the optics metaphor. |

---

## Appendix: Competitor Quick-Reference

| Game | Session Length | Enemy Types | Weapon Slots | Passive Items | XP System | Key Differentiator |
|------|---------------|-------------|--------------|---------------|-----------|-------------------|
| **Vampire Survivors** | 30 min | 50+ | 6 active | 6 passive | Gem pickup | Evolution combos, huge enemy count |
| **Brotato** | ~5 min waves | 20+ | 6 weapons | Unlimited passives | Wave-end shop | Shop economy, short sessions |
| **HoloCure** | 20 min | 30+ | 6 weapons | 6 items | Gem pickup | Collab attacks, character specials |
| **20 Min Till Dawn** | 20 min | 15+ | 1 aimed weapon | Tree upgrades | Gem pickup | Manual aim, dodge roll |
| **Halls of Torment** | 25 min | 40+ | 1 weapon + abilities | Ring slots | Auto XP | ARPG progression, dark aesthetic |
| **Soulstone Survivors** | 15 min | 25+ | Spell loadout | Passive skills | Gem pickup | Spell combos, skill trees |
