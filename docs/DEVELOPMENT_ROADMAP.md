# Prism Development Roadmap

This roadmap starts from the April 2026 playtest result: a clean 10:00 victory at rank 23 with 8k+ kills. The engine, globe traversal, bloom, death screen, HP, XP gems, dash, and 14-shard upgrade set are working. The next work is making late-game survival less automatic and making builds transform more dramatically.

## Current Diagnosis

- The session ends too soon. `SESSION_LENGTH` was 10 minutes, so a stable build reaches victory before late-game pressure can really develop.
- Late pressure is mostly spawn interval decay. It creates density, but not enough tactical variety once the player has a strong beam build.
- Shards have good names and useful numeric scaling, but many synergies are invisible stat bumps rather than new play styles.
- There are enough shard slots for long runs, but max level 5 makes a 10+ minute run run out of exciting upgrade texture too quickly.
- Wave shape exists, but special enemy cocktails are sparse after wave 9.

## Slice 1: Longer Run And Late Pressure

Status: implemented; playtest pending.

- Extend survival victory from 10:00 to 15:00.
- Raise max shard level from 5 to 6 to give the extra five minutes more upgrade runway.
- Ramp enemy cap by wave instead of using only one static cap.
- Add catch-up spawning so high-density waves can actually fill the cap.
- Increase enemy HP, speed, and contact damage more aggressively after 10:00 overdrive.
- Bias late waves toward Splitters, Orbiters, Emitters, and Dashers instead of letting Drone weight dominate.

## Slice 2: Synergy System Upgrade

Status: started with Gravity Well and Event Horizon.

Goal: turn synergies into build-defining effects, not hidden arithmetic.

- Add an explicit synergy activation model in Rust so the UI can query active and almost-active combos.
- Show active synergies on the HUD, not only as hints on level-up cards.
- Add one visible effect per existing combo:
  - Chain Reaction: cascade beams fork into fan patterns and gain a distinct color.
  - Blizzard: frozen enemies shatter into small slow fields on death.
  - Supernova: diffract bursts become thicker expanding spokes.
  - Prism Cannon: chromatic beams converge into a periodic white core shot.
  - Tracking Echo: echo salvos retarget independently instead of replaying the same aim.
  - Frozen Orbit: halo beads leave brief frost trails.
  - Blood Pact: thorns beams heal only on close-range hits, rewarding risky positioning.
  - Martyrdom: thorns kills emit mini cascade pulses.
  - Resonance: barrier hits trigger shorter, more frequent interference ripples.
  - Gravity Well: Magnet + Interference makes pulse rings pull enemies inward.
  - Event Horizon: Momentum + Halo collapses halo orbit tighter and spins it faster.

## Slice 3: Upgrade Variety

Goal: make level-up choices create archetypes.

- Add rarity tags: common numeric upgrades, rare behavior modifiers, legendary evolutions.
- Add reroll and skip after the level-up UI is stable.
- Add 3-4 passive shards:
  - Magnet: larger gem magnet radius and faster pickup pull.
  - Momentum: movement speed and dash cooldown.
  - Armor: reduced contact/projectile damage.
  - Luck: higher chance of rare/evolution offers.
- Add evolution thresholds: when two linked shards reach level 6, unlock a named super-shard offer.

## Slice 4: Enemy And Wave Director

Status: started with Pulsar, Umbra, and collapsing Orbiters.

Goal: make enemy count and enemy composition progress deliberately.

- Replace one-at-a-time continuous spawning with spawn commands:
  - Single
  - Burst Group
  - Pincer
  - Formation
  - Cluster Drop
  - Boss Telegraph
- Add spawn grace so new enemies cannot deal instant contact damage.
- Add late-wave special events at waves 12, 15, 18, 21, 24, and 27.
- Add bosses or elites at 5:00, 10:00, and 15:00:
  - 5:00 Sentinel: slow brute with orbiting shields.
  - 10:00 Hydra: splitter boss that sheds minions.
  - 15:00 Void Prism: final globe-bound boss.

## Vampire Survivors Lens For Prism

The genre usually creates variety through enemy roles, weapon/passive pairings, and evolutions. Prism should translate those ideas through light, optics, and spherical traversal.

Enemy roles to cover:

- Swarm filler: Drones and Splitter children. They make beam count and cascade matter.
- Tank/wall: Brutes. They create pathing pressure on the sphere.
- Burst skill check: Dashers. They punish stationary play.
- Orbit/cage: Orbiters. These should spiral inward like objects falling into the player's gravity well, making escape windows shrink over time.
- Ranged pressure: Emitters. They force lateral movement while enemies close in.
- Area denial: Pulsars. They create bright expanding danger zones on the globe surface.
- Stealth/attention tax: Umbra. They phase in and out, readable mostly by glow.
- Boss/elite: Sentinel, Hydra, Void Prism. These should introduce new rules, not just more HP.

Upgrade roles to cover:

- Weapon count: Split, Mirror, Chromatic.
- Weapon shape: Lens, Refract, Diffract.
- Fire cadence: Echo.
- Passive orbit/area: Halo, Interference.
- Survival: Siphon, Barrier, Thorns.
- Collection/economy: Magnet.
- Movement/escape: Momentum.
- Future passives: Armor, Luck, Prism Heart, Phase Step.

Globe-specific ideas:

- Great-circle beams that wrap around the visible sphere at high evolution levels.
- Polar storms: late waves around pole crossings spawn Pulsars/Umbra more often.
- Meridian events: crossing bright longitude lines briefly boosts Momentum or beam reach.
- Gravity builds: Magnet, Interference, Halo, and Momentum become the "black hole" archetype.
- Refraction builds: Refract, Lens, Chromatic, and Diffract become the "prism cannon" archetype.

## Slice 5: Feedback And Run Goals

Goal: make progression legible and replayable.

- Post-run stats: peak rank, active synergies, favorite shard, damage dealt, deaths avoided by barrier.
- Local high scores.
- Audio events for beam fire, gem pickup, rank-up, synergy activation, boss spawn, and victory.
- Spawn telegraphs and kill streak callouts.
- Optional endless mode after 15:00 once boss structure exists.

## Near-Term Order

1. Finish Slice 1 and playtest a 15-minute run.
2. Build the synergy activation query and active-synergy HUD.
3. Convert 2-3 existing synergies into highly visible effects.
4. Add late-wave spawn patterns before adding new enemy structs.
5. Add the 10:00 Hydra-style pressure event, then decide whether the final win should be pure survival or boss kill.
