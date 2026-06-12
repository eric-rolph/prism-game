# Prism Development Roadmap

Updated May 1, 2026.

This roadmap is the living source of truth for the next Prism pushes. It supersedes the early April review docs where they describe the game as missing health, waves, gems, enemy variety, a spatial background, or shard synergies; those foundations now exist. The next phase is about turning the 15-minute run into a deliberate arc with bosses, more expressive upgrade decisions, audio, replay goals, and playtest-driven balance.

## Current Baseline

Prism is now a playable browser bullet-heaven with:

- Rust/WASM simulation, WebGL2 SDF rendering, HDR-ish bloom fallback, temporal trails, globe projection, and zero-copy draw buffers.
- A 15:00 survival win condition with wave pacing, adaptive breathers, enemy caps that ramp by wave, overdrive pressure after 10:00, and special late-wave events.
- Player HP, i-frames, dash, death/victory screen, score, XP gems, level-up modal, shard tray, dash meter, HP meter, wave banner, and active/near synergy HUD.
- Eight enemy roles: Drone, Brute, Dasher, Splitter, Orbiter, Emitter, Pulsar, Umbra.
- Globe traversal with latitude/longitude grid, polar/limb visual cues, crystals as moving obstacles, and screen shake/hit flashes.
- Twenty shards at max level 6: Split, Refract, Mirror, Chromatic, Lens, Diffract, Echo, Halo, Cascade, Interference, Siphon, Frost, Barrier, Thorns, Magnet, Momentum (active), plus Armor, Luck, Prism Heart, Phase Step (passive).
- Eleven implemented synergies: Chain Reaction, Blizzard, Supernova, Prism Cannon, Tracking Echo, Frozen Orbit, Event Horizon, Blood Pact, Martyrdom, Resonance, Gravity Well.

## Current Diagnosis

- The full boss arc now exists: Sentinel teaches shield positioning, Hydra teaches target priority, and Void Prism closes the run with pull/shockwave space control. The remaining boss work is balance/readability, not missing infrastructure.
- The strongest senior-dev question remains: what does the player decide every 5 seconds? Each new feature should create a readable choice about positioning, target priority, route planning, or build direction.
- Pickup readability needs to stay sacred. Radiance gems must be instantly distinct from enemies in shape, color, animation, and motion trail.
- Upgrade choices now have skip, reroll, passives, and the first evolution offer. The remaining economy work is to add the planned level-6 capstones and only add banish/lock if playtests show persistent bad-offer frustration.
- The death/victory screen now tells the build story and saves local best runs. The remaining replay work is optional endless mode and any meta-progression, both gated behind balance confidence.
- Procedural audio is shipped. Future audio work should be tuning and new event voices for new mechanics, not a new asset pipeline.
- Balance now needs measured playtests at the full 15-minute length: time-to-death, rank curve, kill count, damage sources, shard pick order, synergy/evolution timing, entity pressure, and common winning shard clusters.
- Older docs still contain useful designs, but some status tables are stale. Treat `docs/ENEMY_WAVE_DESIGN.md` as a boss/enemy idea bank and `docs/GENRE_GAP_ANALYSIS.md` as historical context.

## Senior Game-Dev Direction

Prism should avoid adding “more stuff” unless the stuff creates a player decision or strengthens feedback. The goal is not higher entity count; it is sharper reads.

Design principles for the next passes:

- Every 5 seconds, the player should make a decision: dodge, route toward gems, break a cage, hunt a ranged threat, reposition around a boss shield, or commit to a build path.
- Readability beats surprise. Enemies, pickups, boss shields, projectiles, and hazards need distinct silhouettes and motion language.
- Bosses should be rule changes, not large enemies. Sentinel teaches shield positioning; Hydra should teach target priority; Void Prism should teach phase and space management.
- Upgrades need both immediate value and long-horizon intent. Synergies are mid-run excitement; level-6 evolutions are build goals.
- Tune from run evidence. Major balance changes should follow run summaries, not intuition alone.

Immediate senior-dev execution sequence:

1. ✅ Make radiance gems visually unmistakable as pickups.
2. ✅ Add basic debug run summaries for balance evidence.
3. ✅ Improve Sentinel shield feedback and add one explicit attack pattern.
4. ✅ Ship Hydra and Void Prism before deeper extraction work.
5. ✅ Add procedural audio for beams, pickups, shield cracks, rank-up, boss warnings, death, and victory.
6. ✅ Add high-granularity telemetry before heavy balance tuning.
7. ✅ All five level-6 evolutions are shipped.
8. Extract boss/wave/progression modules from `game.rs` once telemetry confirms stability.

## Slice 1: Boss Milestones

Status: started; boss infrastructure and 5:00 Sentinel are implemented.

Goal: make the run feel like a beginning, middle, and finale rather than one continuous pressure ramp.

### 1.1 Boss Infrastructure

- ✅ Add `BossKind`, `BossState`, and a boss entity path that can still render through the existing circle/beam instance buffers.
- ✅ Track boss HP, phase, spawn timer, death timer, and boss-kill count separately from regular enemies.
- ✅ Add boss spawn telegraph, boss-active HUD label, and boss death clear/fanfare state.
- ✅ During boss spawn, pause or heavily reduce continuous spawns until enemy count is manageable.
- ✅ Add a 3-second post-boss breather and bonus XP gem burst.

### 1.2 5:00 Sentinel

- ✅ Large single-body boss with orbiting shields.
- ✅ Slow drift toward the player, high contact damage, and phase color changes.
- ✅ Shields absorb beams until the player moves around or breaks them.
- Intended lesson to playtest: bosses have rules; raw beam density is not always enough.

### 1.3 10:00 Hydra

- ✅ Three colored lobes (red/green/blue) orbiting a shared center, each with 6500 HP.
- ✅ Lobe death spawns 3 type-specific adds (Dasher/Emitter/Orbiter) and a particle burst.
- ✅ Formation speeds up as lobes die; surviving lobes fire projectiles periodically.
- ✅ Boss HP bar reflects total remaining lobe health.
- Intended lesson: target priority matters under late-wave pressure.

### 1.4 13:00 Void Prism

- ✅ Final globe-bound boss with a dark core and bright violet rim.
- ✅ Pulls all enemies inward, emits expanding player-damaging shockwave rings at intervals.
- ✅ Phase 2 (≤ 50% HP): faster movement, shorter shockwave interval, larger rings.
- ✅ Killing it ends the run immediately with a victory; surviving to 15:00 also grants victory.

### 1.5 Boss Damage Policy

- ✅ Beam-like primary and secondary effects, including Diffract and Cascade, respect Sentinel shields and can trigger shield-break feedback.
- ✅ Aura/field effects such as Halo, Barrier contact, and Interference intentionally bypass Sentinel shields because they reward risky positioning rather than aim angle.

## Slice 2: Upgrade Economy

Status: ✅ complete; all evolutions, passive shards, skip, and reroll are implemented.

Goal: give level-ups short-term tactics and long-term build planning.

- ✅ Add skip: closes the level-up modal and grants a small heal or radiance payout.
- ✅ Add reroll: two charges per run by default; later affected by Luck.
- Add banish/lock only if playtests show bad-offer frustration after reroll/skip exists.
- ✅ Add passive shards:
  - ✅ Armor: reduces all incoming damage by 8% per level (up to 48% at L6).
  - ✅ Luck: boosts rare shard weight ×0.25/level and legendary ×0.50/level in rolls.
  - ✅ Prism Heart: +15 max HP per level (instant heal on pick); level-up heals 10% more per level.
  - ✅ Phase Step: +0.12s dash i-frames per level; L3+: particle afterimage on dash start.
- ✅ Add evolution-offer plumbing: when a linked pair reaches level 6, level-up can offer a named super-shard instead of another normal upgrade.
- ✅ Add all five planned level-6 evolutions.
- Keep active synergies at level 3; evolutions are the level-6 “capstone” layer, not a replacement for synergies.

Evolutions (all shipped):

- ✅ Kaleidoscope: Split 6 + Mirror 6; radial fan salvos become patterned great-circle bursts.
- ✅ Whiteout: Frost 6 + Diffract 6; frozen kills emit freezing starbursts and longer frost fields.
- ✅ Singularity: Magnet 6 + Interference 6; pulse rings become stronger gravity wells with a dark center.
- ✅ Solar Crown: Halo 6 + Barrier 6; orbitals reinforce the shield and flare on contact.
- ✅ Afterimage Engine: Echo 6 + Momentum 6; dash leaves a temporary firing echo.

## Slice 3: Audio Event System

Status: ✅ complete.

Goal: make Prism feel physical without shipping a sound-asset pipeline.

- Add a small Web Audio manager in TypeScript, initialized on first user gesture.
- Expose a compact Rust event buffer or counters for important events:
  - beam fired
  - enemy killed
  - XP gem collected
  - player damaged
  - rank up
  - synergy activated
  - boss spawn
  - boss phase change
  - victory/death
- Use synthesized voices first: crystalline ping, low impact thump, shimmer pickup, glassy rank-up chord, warning pulse.
- Add voice limits and cooldowns so dense late-game kills do not turn into noise.
- Duck/low-pass the mix while the level-up modal is open.

## Slice 4: Run Goals And Persistence

Status: in progress; post-run stat storytelling and local best runs are implemented.

Goal: make every run leave a footprint.

- ✅ Expand post-run stats:
  - ✅ time survived
  - ✅ peak rank
  - ✅ kills
  - ✅ active synergies
  - ✅ top-level shards
  - ✅ boss kills
  - ✅ damage taken
  - ✅ barrier damage absorbed
  - ✅ gems collected
- ✅ Save local high scores in `localStorage`.
- ✅ Add a “best run” panel on the death/victory screen.
- Add optional endless mode after a 15:00 victory once bosses are stable.
- Add lightweight meta-progression only after high scores prove replay interest. Avoid permanent upgrades until base balance feels good without them.

## Slice 5: Playtest Telemetry And Balance

Status: in progress; high-granularity run summary telemetry is implemented, and balance playtests are next.

Goal: tune from run evidence, not vibes.

- ✅ Add a debug run summary export to console with seed, outcome, duration, score, rank/peak rank, total kills, boss kills, enemy kills by kind, damage totals, gems collected, active synergies/evolutions, and final shard levels.
- ✅ Add high-granularity telemetry:
  - ✅ death cause
  - ✅ rank timeline
  - ✅ damage taken by source
  - ✅ shard pick order
  - ✅ skip/reroll counts
  - ✅ active synergy times
  - ✅ max enemies/circles/beams observed
- Run three baseline 15-minute playtests:
  - no rerolls, normal input
  - aggressive close-range build
  - runaway beam build
- Target balance:
  - First death should be plausible by minute 4-7 on an unfocused build.
  - Strong builds should still need movement after 10:00.
  - Bosses should take 20-45 seconds on a healthy build, not evaporate instantly.
  - Rank-ups should remain frequent early, then slow enough that choices matter.

## Slice 6: Technical Hardening

Status: opportunistic, but do before public sharing.

- Add WebGL context loss and restore handling.
- Add CSP/security headers for the Worker deployment.
- Revisit release `opt-level = "z"` if performance becomes more important than smallest WASM.
- Add a spatial broad phase if 420 enemies plus beams causes collision cost spikes on low-end devices.
- Add deterministic smoke tests around shard choice, death/victory, and key enemy state transitions.
- Keep `src/game.rs` from growing into an unreviewable monolith by extracting boss, waves, and progression modules as each subsystem stabilizes.

## Near-Term Order

1. ✅ Fix Hydra aura damage (Halo/Interference wrote boss.hp, overwritten each frame by lobe sum) and auto-targeting (aimed at center with no hitbox; now targets nearest living lobe).
2. ✅ Add touch dash: short tap on mobile now triggers dash; HUD label updated to DASH [SPACE / TAP].
3. Play three baseline 15-minute runs using the exported telemetry:
   - normal input, no forced build
   - aggressive close-range Halo/Barrier/Siphon path
   - runaway beam Split/Mirror/Cascade path
4. Tune boss HP, projectile cadence, and late-wave pressure from those runs.
5. Add structured telemetry export (JSON history, fixed seed, boss TTK, offer sets, death context) before heavy balance tuning.
6. Do technical hardening before public sharing: WebGL context loss/restore, Worker security headers, CI workflow, deterministic smoke tests, Rust/TS constant deduplication, and selective `game.rs` extraction.
7. Add endless mode only after the 15-minute arc feels stable under telemetry evidence.

## Cut Features

- **Corruption patches (June 2026).** Lingering enemies stained the surface with dark patches that slowed the player, healed the player (contradictory), erupted Void Spawn mini-bosses, and dimmed the globe. Cut entirely: every causal link (3s linger → invisible growth → off-screen eruption) was unreadable, beams silently deleted patches on contact so the system mostly operated off-screen, cleansing had no reward, and 48 dark zero-glow blotches wrecked late-run readability — playtesting feedback was "unclear what the blotches are." The Pulsar's VoidShell survives as pure telegraphed artillery (warning ring now matches the true damage radius), and the VoidSpawn mini-boss was deleted with the system (it was a Brute reskin with no identity beyond corruption). If territory pressure returns, it must obey the readability principles above: visible causality, a reason to engage, and one clear rule.

## Done / Completed

- Opening on-ramp (June 2026): spawn interval eases from 2.2× to steady state over the first 100 s, enemy cap is 80/155/230 for waves 0-2, and the first five waves are Steady so the Surge/Swarm/Elite/Crescendo rotation starts at wave 5 (2:30). The "increase difficulty" pass had applied its 300-enemy base cap from wave 0, flooding the tutorial minute (bot A/B: median time-to-death 33 s → 66 s; everything past wave 3 / 100 s is formula-identical).
- Radiance gems rendered as distinct pickup crystals/sparkles instead of enemy-like round dots.
- 15-minute session length.
- Max shard level 6.
- Wave-ramped enemy cap and catch-up spawning.
- Stronger overdrive scaling after 10:00.
- Late-wave special events at waves 12, 15, 18, 21, 24, and 27.
- Enemy roster expansion through Umbra.
- XP gems and Magnet support.
- Momentum and dash support.
- Level-up healing.
- Rarity tags on shard cards.
- Active and near synergy HUD.
- All 11 planned synergy effects.
- Background globe/grid, screen shake, hit flash, HP ring, death/victory screen.
- Boss infrastructure and 5:00 Prism Sentinel.
- 10:00 Hydra (three 6500 HP lobes) and 13:00 Void Prism bosses.
- All five level-6 evolutions: Kaleidoscope, Whiteout, Singularity, Solar Crown, Afterimage Engine.
- All four passive shards: Armor, Luck, Prism Heart, Phase Step (+0.12s i-frames/level).
- High-granularity run telemetry export.
- Procedural audio event system.
- Hydra aura-damage bug fixed: Halo and Interference now write lobe_hp[i], not boss.hp.
- Hydra auto-targeting fixed: beams now aim at nearest living lobe, not the center.
- Touch dash: tap to dash on mobile; tap detection threshold 12 px / 220 ms.
