# Prism Development Roadmap

Updated April 29, 2026.

This roadmap is the living source of truth for the next Prism pushes. It supersedes the early April review docs where they describe the game as missing health, waves, gems, enemy variety, a spatial background, or shard synergies; those foundations now exist. The next phase is about turning the 15-minute run into a deliberate arc with bosses, more expressive upgrade decisions, audio, replay goals, and playtest-driven balance.

## Current Baseline

Prism is now a playable browser bullet-heaven with:

- Rust/WASM simulation, WebGL2 SDF rendering, HDR-ish bloom fallback, temporal trails, globe projection, and zero-copy draw buffers.
- A 15:00 survival win condition with wave pacing, adaptive breathers, enemy caps that ramp by wave, overdrive pressure after 10:00, and special late-wave events.
- Player HP, i-frames, dash, death/victory screen, score, XP gems, level-up modal, shard tray, dash meter, HP meter, wave banner, and active/near synergy HUD.
- Eight enemy roles: Drone, Brute, Dasher, Splitter, Orbiter, Emitter, Pulsar, Umbra.
- Globe traversal with latitude/longitude grid, polar/limb visual cues, crystals as moving obstacles, and screen shake/hit flashes.
- Sixteen shards at max level 6: Split, Refract, Mirror, Chromatic, Lens, Diffract, Echo, Halo, Cascade, Interference, Siphon, Frost, Barrier, Thorns, Magnet, Momentum.
- Eleven implemented synergies: Chain Reaction, Blizzard, Supernova, Prism Cannon, Tracking Echo, Frozen Orbit, Event Horizon, Blood Pact, Martyrdom, Resonance, Gravity Well.

## Current Diagnosis

- The run now has its first milestone encounter at 5:00, but the full boss arc is not complete. Late-game pressure after Sentinel still comes mostly from density, cocktails, and events rather than Hydra/Void Prism rules.
- The strongest senior-dev question is now: what does the player decide every 5 seconds? Each new feature should create a readable choice about positioning, target priority, route planning, or build direction.
- Pickup readability needs to stay sacred. Radiance gems must be instantly distinct from enemies in shape, color, animation, and motion trail.
- Upgrade choices are readable but still mostly “pick one of three.” There is no reroll, skip, banish, evolution offer, or long-horizon build target after a synergy activates.
- The death/victory screen reports only score, rank, kills, and survival time. It does not yet tell the story of the build or give the player a saved target to beat.
- Audio remains the biggest missing sensory layer. The visuals now have enough state changes to drive a good Web Audio event system without needing asset files.
- Balance needs measured playtests at the new 15-minute length: time-to-death, rank curve, kill count, damage taken sources, and common winning shard clusters.
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

1. Make radiance gems visually unmistakable as pickups.
2. Add debug run summaries for balance evidence.
3. Improve Sentinel shield feedback and add one explicit attack pattern.
4. Extract boss/wave/progression modules from `game.rs` before Hydra.
5. Add procedural audio for beams, pickups, shield cracks, rank-up, boss warnings, death, and victory.

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

- Splitter boss that sheds minions at HP thresholds.
- Three colored lobes or linked bodies, each changing the fight when destroyed.
- Intended lesson: target priority matters under late-wave pressure.

### 1.4 15:00 Void Prism

- Final globe-bound boss with a dark core and bright rim.
- Pulls enemies inward, emits expanding shockwaves, and grows more dangerous in the final phase.
- Killing it ends the run immediately; otherwise survival at 15:00 still grants victory once the boss system is tuned.

## Slice 2: Upgrade Economy

Status: queued after Sentinel or in parallel if boss work stalls.

Goal: give level-ups short-term tactics and long-term build planning.

- Add skip: closes the level-up modal and grants a small heal or radiance payout.
- Add reroll: one or two charges per run by default; later affected by Luck.
- Add banish/lock only if playtests show bad-offer frustration after reroll/skip exists.
- Add passive shards:
  - Armor: reduces contact and projectile damage.
  - Luck: improves rare/legendary/evolution offer chances and reroll quality.
  - Prism Heart: increases max HP and improves level-up healing.
  - Phase Step: extends dash i-frames or leaves a short afterimage.
- Add evolution offers: when two linked shards reach level 6, the next level-up can offer a named super-shard instead of another normal upgrade.
- Keep active synergies at level 3; evolutions are the level-6 “capstone” layer, not a replacement for synergies.

Candidate evolutions:

- Kaleidoscope: Split 6 + Mirror 6; radial fan salvos become patterned great-circle bursts.
- Whiteout: Frost 6 + Diffract 6; kills emit freezing starbursts and longer frost fields.
- Singularity: Magnet 6 + Interference 6; pulse rings become stronger gravity wells with a dark center.
- Solar Crown: Halo 6 + Barrier 6; orbitals reinforce the shield and flare on contact.
- Afterimage Engine: Echo 6 + Momentum 6; dash leaves a temporary firing echo.

## Slice 3: Audio Event System

Status: unstarted.

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

Status: unstarted.

Goal: make every run leave a footprint.

- Expand post-run stats:
  - time survived
  - peak rank
  - kills
  - active synergies
  - top-level shards
  - boss kills
  - damage taken
  - barrier damage absorbed
  - gems collected
- Save local high scores in `localStorage`.
- Add a “best run” panel on the death/victory screen.
- Add optional endless mode after a 15:00 victory once bosses are stable.
- Add lightweight meta-progression only after high scores prove replay interest. Avoid permanent upgrades until base balance feels good without them.

## Slice 5: Playtest Telemetry And Balance

Status: needed before heavy tuning.

Goal: tune from run evidence, not vibes.

- Add a debug run summary export to console or clipboard:
  - seed
  - duration
  - death cause or victory
  - rank timeline
  - enemy kills by kind
  - damage taken by source
  - shard pick order
  - active synergy times
  - max enemies/circles/beams observed
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

1. Play one 15-minute run and record how the 5:00 Sentinel changes the run texture.
2. Add debug run summary output so balance changes have evidence.
3. Tune Sentinel HP, shield HP, add cadence, and late-wave pressure from two or three full runs.
4. Decide between 10:00 Hydra and upgrade-economy work based on the playtest:
   - If the run still feels flat, build Hydra next.
   - If choices feel stale before 10:00, build skip/reroll and first evolutions next.
5. Add the Web Audio event system before polish work; it will make every later feature easier to evaluate.

## Done / Completed

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
