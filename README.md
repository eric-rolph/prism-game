# Prism

Auto-firing light, refracted through shards you collect. A Vampire-Survivors-paced action game rendered as geometric light, built in Rust + WASM, deployed to Cloudflare Workers.

**[▶ Play at prism.ericrolph.workers.dev](https://prism.ericrolph.workers.dev/)**

**Controls:** WASD or arrow keys. On touch devices, drag anywhere — it becomes a virtual analog stick. When a rank-up modal appears, click a card or press `1` / `2` / `3`. `Esc` to pause.

## What it is

You move across the surface of a 3D sphere. Light beams auto-fire toward the nearest enemy. Every level-up offers three shard upgrades — each one modifies how your beams behave (split, refract, mirror, chromatic dispersion, homing, echo, frost, arc, etc.). Stack enough shards and synergies unlock, evolving your build into something spectacular. The visual complexity scales with your build: a fresh run is a few thin cyan lines; a late-game evolved build is hundreds of overlapping spectral beams, orbiting geometry, and prismatic caustic effects filling the screen.

Fifteen-minute runs. 23 shards. 5 evolutions. 3 boss milestones.

## Visuals

- **Globe surface** — you traverse a traversable sphere rendered in GLSL with correct spherical-arc movement; the background shows meridians, parallels, polar glow, and animated caustic interference patterns
- **Light beams** — SDF capsule shader with white-hot inner core, spectral rainbow fringe, photon ripple, prism core interference bands, and per-upgrade chromatic split (R/G/B sub-beams)
- **Player body** — grows as upgrades stack: emitter nodes orbit at increasing radius, a counter-rotating inner ring appears at depth, a rainbow 12-point geometric crown activates when evolutions unlock
- **Post-processing** — separable Gaussian bloom (intensity scales logarithmically with your build), temporal persistence trails, chromatic aberration, CRT scan-line, radial vignette, Reinhard tonemap

## Stack

- **Rust** → `wasm-pack` → WebAssembly (simulation, shard logic, collision, globe math)
- **WebGL2** + **TypeScript** + **Vite** (renderer, HUD, bootstrap)
- **Cloudflare Workers** static assets via **Wrangler**
- **GitHub Actions** deploys on push to `main`

## Architecture

**Render pipeline (4 passes):**
1. Globe background — spherical surface with meridian grid, parallels, caustics
2. Geometry — instanced SDF circles (player body, enemies, particles, orbitals) + SDF capsules (beams) → HDR FBO, additive blending
3. Bloom — box downsample → separable 13-tap Gaussian (H+V × 2 cycles at half-res) → 9-tap tent upsample to full-res
4. Composite — chromatic aberration (scales with upgrade intensity), temporal persistence, logarithmic bloom, radial pulse, vignette, Reinhard tonemap, gamma

**Zero-copy WASM↔JS boundary.** Rust packs each frame's draw calls into two flat `Vec<CircleInstance>` / `Vec<BeamInstance>` buffers with `#[repr(C)]`; JavaScript reads the pointers + lengths and creates `Float32Array` views directly over WASM linear memory. No serialization, no marshalling.

**Globe math.** World x/y are arc lengths on an equirectangular chart. `move_on_globe` uses the rotation formula `next = normal·cos(θ) + dir·sin(θ)` to move exactly along a great-circle geodesic. The vertex shader projects the flat local patch back onto the sphere via `sin(θ)/θ` to keep circle/beam shapes correct.

## Prerequisites

- Rust stable (pinned in `rust-toolchain.toml`)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)
- Node 22+

## Local development

```bash
# Rebuild the WASM module whenever anything under src/ changes.
wasm-pack build --target web --out-dir web/wasm --out-name prism --dev

# In another terminal:
cd web
npm install
npm run dev
```

Open http://localhost:5173.

## Deploy

One-time: add `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets. Then push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys.

## Layout

```
prism/
├── Cargo.toml                      Rust package manifest
├── rust-toolchain.toml             Pinned toolchain
├── src/
│   ├── lib.rs                      #[wasm_bindgen] surface
│   ├── game.rs                     State, update loop, globe math, draw buffers
│   ├── shards.rs                   23 shard operators + compose_salvo pipeline
│   ├── entities.rs                 Plain data structs
│   └── math.rs                     Seeded xorshift RNG
├── web/
│   ├── index.html                  Canvas + HUD
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts                 Bootstrap + RAF loop + HUD/modal + intensity
│       ├── renderer.ts             WebGL2 pipeline
│       ├── shaders.ts              GLSL 300 ES — beams, circles, globe, bloom, composite
│       ├── audio.ts                Web Audio procedural voices
│       └── input.ts                Keyboard + touch
├── wrangler.toml                   Cloudflare Workers config
├── .github/workflows/deploy.yml    CI
└── .gitignore
```

## Shards

| Shard | Effect | Rarity |
|---|---|---|
| Split | Fan out more beams per volley | Common |
| Refract | Beams curve toward nearest enemy | Rare |
| Mirror | Fire in every direction | Common |
| Chromatic | Split into R/G/B sub-beams | Common |
| Lens | Thicker, heavier beams | Common |
| Diffract | Hits scatter into radial bursts | Rare |
| Echo | Second salvo after a short delay | Rare |
| Halo | Orbital beads strike on contact | Rare |
| Cascade | Kills fork into secondary beams | Legendary |
| Interference | Standing-wave pulses ripple outward | Legendary |
| Siphon | Beams heal you on every hit | Common |
| Frost | Beams slow enemies on hit | Common |
| Barrier | Energy shield absorbs + deals damage | Common |
| Thorns | Taking damage fires retaliatory beams | Rare |
| Magnet | Pull radiance gems from farther away | Common |
| Momentum | Move faster, shorten dash cooldown | Common |
| Armor | Reduce all incoming damage | Common |
| Luck | Rare/legendary shards appear more often | Rare |
| Prism Heart | +15 max HP per level | Common |
| Phase Step | Longer i-frames on dash | Rare |
| Arc | Chain lightning between nearby enemies | Rare |
| Minefield | Seed faceted charges that burst and pull | Legendary |
| Lance | Periodic heavy piercing rail shot | Rare |

## Evolutions (level two shards to 6)

| Evolution | Recipe | Effect |
|---|---|---|
| Afterimage Engine | Echo 6 + Momentum 6 | Dashing leaves firing echoes |
| Whiteout | Frost 6 + Diffract 6 | Frozen kills burst into freezing rays |
| Kaleidoscope | Split 6 + Mirror 6 | Every salvo fires a 24-ray great-circle ring |
| Singularity | Magnet 6 + Interference 6 | Interference rings become gravity wells |
| Solar Crown | Halo 6 + Barrier 6 | Halo contacts recharge barrier; barrier hits flare orbitals |

## Roadmap

1. ✅ Pipeline — Rust/WASM + WebGL2 + Cloudflare Workers CI
2. ✅ Renderer — SDF beams + circles, additive blend, multi-scale bloom, chromatic aberration, persistence, tonemap
3. ✅ Shard system — 23 operators, compose_salvo pipeline, level-up picker, rarity, synergy HUD
4. ✅ Survival — 15-minute session, wave pressure, 8 enemy roles, XP gems, dash
5. ✅ Boss milestones — Sentinel, Hydra, Void Prism
6. ✅ Upgrade economy — skip/reroll/passives, 5 level-6 evolutions
7. ✅ Procedural audio — Web Audio voices for beams, gems, rank-ups, synergies, bosses
8. ✅ Run goals — post-run stats, local high scores
9. ✅ Globe movement — true spherical-arc traversal, correct great-circle geodesics
10. ✅ Player body evolution — layered visual geometry that builds out as upgrades stack
11. ✅ Spectral light physics — prism core interference fringes, photon ripple, chromatic sub-beams, logarithmic bloom scaling
