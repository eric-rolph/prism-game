# PRISM — Multi-Agent Review Synthesis

> **9 specialist reviews** (5 engineering + 4 game design) synthesized into a single prioritized action plan.

## Executive Summary

**Prism is a beautiful engine in search of a game.** The rendering pipeline is well-architected, the SDF visuals are distinctive, and the shard system has genuine thematic coherence. But the game is boring because it's missing the fundamental contract of a game: **the possibility of failure**.

| Strength | Weakness |
|----------|----------|
| WebGL2 SDF pipeline (clean, performant) | No player death / no stakes |
| Instanced rendering architecture | Zero audio |
| Optics/light shard naming (thematic) | No visual feedback (hits, damage, spawns) |
| Cascade chain mechanic (exciting when it works) | Single enemy type, infinite featureless arena |
| Zero-copy WASM↔JS bridge | No session structure (no beginning, middle, end) |
| Lean codebase (~1500 lines Rust) | RGBA8 FBO kills bloom quality |

**One-line verdict:** Add death, add sound, add feedback, add structure. The engine is done; now build the game.

---

## Review Sources

| Agent | Domain | Key Finding |
|-------|--------|-------------|
| **Code Reviewer** | Code quality | Echo infinite chain bug, select_shard modal bug |
| **Security Engineer** | Security | No CSP header, no context loss handling |
| **Performance Benchmarker** | Performance | O(B×E) collision, opt-level "z" suboptimal, cascade chain unbounded |
| **Frontend Developer** | Web/mobile | Mobile modal broken, no safe-area-inset, touch feedback missing |
| **Software Architect** | Architecture | Monolithic game.rs, scratch buffer allocations per frame |
| **Game Designer** | Mechanics | "A game without loss is a screensaver with extra steps" |
| **Level Designer** | Spatial | "Every position is identical to every other position" |
| **Technical Artist** | Visuals | "All output, no feedback" — rendering is decorative not communicative |
| **Game Audio Engineer** | Audio | "Silence is destroying 40-60% of game feel" |
| **Narrative Designer** | Theme | "Strong metaphor, zero commitment" — rename XP/Ranks, add shard flavour |

---

## Prioritized Action Plan

### TIER 1: Critical (Ship-Blocking)
*These transform Prism from tech demo to game. Do these first.*

#### 1.1 Add Player Health and Death
**Source:** Game Designer, Level Designer
**Impact:** ★★★★★ — Without this, nothing else matters.
**Effort:** ~100 LOC Rust + ~50 LOC TS

- Player starts at 100 HP
- Enemy contact deals 10 damage with 0.5s i-frames (invincibility flash)
- HP ≤ 0 → death → score screen → "Play Again" button
- Display HP as a ring around player dot (SDF ring in circle shader)
- Death animation: player contracts to point, brief black, score screen
- Score = kills × time_survived × shard_diversity_bonus
- localStorage high score table (5 entries)

#### 1.2 Add Minimum Viable Audio (3 Sounds)
**Source:** Game Audio Engineer
**Impact:** ★★★★★ — "40-60% of game feel is missing"
**Effort:** ~150 LOC JS (Web Audio API manager) + 3 sound assets

| Sound | Character | Trigger |
|-------|-----------|---------|
| Enemy death | Crystalline shatter + sub thump | Every kill |
| Beam fire | Soft ping/tick (non-fatiguing) | Every 0.2s |
| Cascade chain | Death sound pitched up per chain step | Chain kills |

Architecture: Rust emits event IDs via wasm-bindgen → JS audio manager plays. Voice limits: 8 concurrent deaths, 4 concurrent beams.

#### 1.3 Add Screen Shake + Hit Flash
**Source:** Technical Artist
**Impact:** ★★★★★ — "Will do more than every other visual change combined"
**Effort:** ~30 LOC

- Enemy hit: 1-frame white color override (uniform change, zero draw calls)
- Enemy death: 2-4px screen shake for 80ms
- Player damage: directional shake
- All shake applied as camera offset in the composite pass

#### 1.4 Fix Echo Infinite Chain Bug
**Source:** Code Reviewer, Performance Benchmarker
**Impact:** 🔴 BUG — Potential infinite loop / stack overflow
**Effort:** ~10 LOC

- `fire_primary` → `fire_primary_inner(schedule_echo: bool)`
- Echo re-fires call `fire_primary_inner(false)` to prevent recursive echo scheduling
- Cap cascade chain depth at 10

---

### TIER 2: High Priority (Core Gameplay)
*These create the actual game experience.*

#### 2.1 Add Session Structure (10-Minute Timer)
**Source:** Game Designer, Level Designer
**Impact:** ★★★★ — Creates beginning, middle, and end
**Effort:** ~80 LOC Rust + ~40 LOC TS

- 10-minute survival timer displayed in HUD
- Survive → win screen with score + stats
- 5 phases (2 min each), each introducing:
  - Phase 1: Drones only (current enemies)
  - Phase 2: Faster spawn + Chargers (new enemy type)
  - Phase 3: Splitters introduced
  - Phase 4: All types, max density
  - Phase 5: Boss wave (large enemy, high HP, unique pattern)

#### 2.2 Add 3 Enemy Types
**Source:** Game Designer, Level Designer, Narrative Designer
**Impact:** ★★★★ — "Movement becomes meaningful when different enemies require different responses"
**Effort:** ~150 LOC Rust

| Enemy | Behaviour | Visual | Player Response |
|-------|-----------|--------|-----------------|
| **Shade** (current) | Drift toward player | Dim purple, slow | Kite away |
| **Charger** | Fast dash → pause 1s → repeat | Bright pulsing purple | Dodge sideways |
| **Splitter** | On death → 2 smaller copies | Larger, with inner fracture line | Prioritize or ignore |

#### 2.3 Add Arena Boundary
**Source:** Level Designer
**Impact:** ★★★★ — "Instantly creates center vs. edge distinction"
**Effort:** ~60 LOC Rust + shader tweak

- Circular arena, ~1200 unit radius
- Soft boundary: damage zone beyond radius (visual: edge glow/fog)
- Creates wall-pressure encounters, prevents infinite kiting
- Background grid or dot-field at 5-8% opacity for spatial reference

#### 2.4 Upgrade FBO to RGBA16F
**Source:** Technical Artist, Performance Benchmarker
**Impact:** ★★★★ — "Unlocks real HDR bloom"
**Effort:** ~5 LOC (one-line format change + fallback check)

- `gl.RGBA8` → `gl.RGBA16F`, `gl.UNSIGNED_BYTE` → `gl.HALF_FLOAT`
- Check `EXT_color_buffer_float` support, fall back to RGBA8
- Overlapping glows will stack properly; bloom quality jumps dramatically

---

### TIER 3: Medium Priority (Polish & Depth)
*These make the game feel complete.*

#### 3.1 Rework 3 Weak Shards + Add 2 Defensive
**Source:** Game Designer
**Impact:** ★★★ — Build diversity and decision depth

| Old | New | Change |
|-----|-----|--------|
| Refract | **Prism Shift** | Beams penetrate through enemies, hitting everything in line |
| Lens | **Focus** | Charge damage by not moving (1.5×@1s, 2×@2s) — risk/reward |
| Echo | **Afterimage** | Leave stationary firing copy for 3s — zone control |
| — | **Phase** (NEW) | Dash on cooldown with brief i-frames — active skill |
| — | **Absorb** (NEW) | Close-range kills restore 5 HP — risk/reward proximity |

#### 3.2 Rename All Non-Optics Terms
**Source:** Narrative Designer
**Impact:** ★★★ — "Thematic consistency is the cheapest credibility you can buy"
**Effort:** ~30 min find-and-replace

| Current | Replacement |
|---------|-------------|
| XP | Radiance |
| Rank | Wavelength |
| Score | Peak Radiance |
| Kills | — (keep as stat, don't rename) |

#### 3.3 Add Shard Flavour Text
**Source:** Narrative Designer
**Impact:** ★★★ — "Transforms mechanical menu into moment of discovery"
**Effort:** ~30 min writing + UI tweak

One evocative line per shard on the level-up screen:
> **Cascade**: *Light finds every crack. One beam becomes ten.*
> **Mirror**: *What strikes you strikes back.*
> **Halo**: *You don't just shine. You burn the air around you.*

#### 3.4 Adaptive Music (3 Crossfading Loops)
**Source:** Game Audio Engineer
**Impact:** ★★★ — "Game stops feeling like a tech demo"
**Effort:** 2-3 days (asset creation + ~80 LOC JS)

- 3 loops: ambient drone, mid-intensity, high-intensity
- Crossfade based on `enemies_alive / spawn_rate` intensity parameter
- Quantize transitions to 4-bar boundaries
- Duck music 6dB + LPF during level-up modal
- Style: crystalline synthwave ambient (Solar Fields / Disasterpeace)

#### 3.5 Add Background Spatial Reference
**Source:** Level Designer, Technical Artist, Narrative Designer
**Impact:** ★★★ — Orientation + environmental storytelling

- Subtle dot grid at 5-8% opacity, parallax-scrolled (not locked to camera)
- Background colour shifts from black → deep blue → violet as radiance grows
- Death locations leave brief scorch marks (spatial memory)
- Camera lead: offset 15-20% in movement direction

#### 3.6 Enemy Spawn Telegraph + Death Burst Upgrade
**Source:** Technical Artist
**Impact:** ★★★ — "Removes unfair deaths, makes kills feel earned"

- Spawn: pulsing circle 0.3s before materializing
- Death: white core flash + 25 particles (up from 10) + expanding ring shockwave
- Converging particle effect at spawn point

---

### TIER 4: Engineering Fixes
*These prevent bugs, improve robustness.*

| ID | Fix | Source | Effort |
|----|-----|--------|--------|
| 4.1 | Fix `select_shard` empty slot closes modal | Code Reviewer | 5 LOC |
| 4.2 | WebGL context loss handling | Frontend Dev, Security | 30 LOC |
| 4.3 | Add CSP header | Security Engineer | 5 LOC |
| 4.4 | `opt-level = "z"` → `"s"` or `"2"` | Perf Benchmarker | 1 LOC |
| 4.5 | Spatial grid for O(B×E) collision | Software Architect | 100 LOC |
| 4.6 | Scratch buffers for salvo allocations | Software Architect | 40 LOC |
| 4.7 | Mobile safe-area-inset + touch feedback | Frontend Dev | 20 LOC |
| 4.8 | Refract damage division guard | Code Reviewer | 2 LOC |

---

## Implementation Order

```
Week 1: "Make It a Game"
├── 1.1 Player health + death + score screen
├── 1.2 Three sounds (death, beam, cascade)
├── 1.3 Screen shake + hit flash
├── 1.4 Fix echo infinite chain + cascade cap
└── 4.1 Fix select_shard bug

Week 2: "Give It Structure"
├── 2.1 Session timer (10 min)
├── 2.2 Add Charger + Splitter enemies
├── 2.3 Arena boundary (circular)
├── 2.4 RGBA16F upgrade
└── 3.2 Rename XP→Radiance, Rank→Wavelength

Week 3: "Make It Feel Good"
├── 3.5 Background grid + colour shift
├── 3.6 Spawn telegraph + death burst
├── 3.3 Shard flavour text
├── 3.4 Adaptive music (3 loops)
└── 4.2-4.8 Engineering fixes

Week 4: "Deepen the Game"
├── 3.1 Rework weak shards + add Phase/Absorb
├── Polish and playtest
└── Ship update
```

---

## Metrics for Success

After implementation, Prism should pass these tests:

| Test | Before | After |
|------|--------|-------|
| Average session length | ∞ (never ends) | 5-10 minutes |
| Reason to replay | None | Beat high score, try new build |
| Player decisions per minute | ~1 (shard pick) | ~15 (movement, ability timing, threat priority) |
| Audio channels active | 0 | 5-10 |
| Enemy types | 1 | 3-4 |
| Visual feedback events | 0 per kill | 3+ per kill (flash, shake, burst, sound) |
| "One more run" impulse | None | Strong (score to beat, build to try) |

---

*Generated by 9 specialist agents: Code Reviewer, Security Engineer, Performance Benchmarker, Frontend Developer, Software Architect, Game Designer, Level Designer, Technical Artist, Game Audio Engineer, Narrative Designer.*
