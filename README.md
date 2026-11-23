# Prism

[![Play Live](https://img.shields.io/badge/Play%20Live-prism.ericrolph.workers.dev-38bdf8)](https://prism.ericrolph.workers.dev/)
[![Rust + WASM](https://img.shields.io/badge/Rust-WebAssembly%20%2B%20GLSL-f97316?logo=rust&logoColor=white)](https://github.com/eric-rolph/prism-game)

Auto-firing light, refracted through shards you collect — paired with an **escalating FPS Mouse Aim-Trainer Overdrive layer** and a **6-movement procedural classic/modern Web Audio soundtrack**. Built in **Rust + WebAssembly + WebGL2 + TypeScript** and deployed to Cloudflare Workers (~109 kB gzip, zero external assets, strict `default-src 'none'` CSP).

**[▶ Play Live at prism.ericrolph.workers.dev](https://prism.ericrolph.workers.dev/)**

<p align="center">
  <a href="https://prism.ericrolph.workers.dev/">
    <img src="docs/preview-title.png" alt="Prism asymmetric editorial title screen with live mouse-reactive refracting crystal prism" width="760" />
  </a>
</p>

<p align="center">
  <a href="https://prism.ericrolph.workers.dev/">
    <img src="docs/preview.png" alt="Prism live combat — faceted rainbow prism, FPS Aim-Trainer Smooth Track orb, optical crosshair, diamond gems, and laser beams" width="760" />
  </a>
</p>

## Controls

- **Keyboard + Mouse (Full Hybrid Mode):**
  - `WASD` / Arrow keys — glide across the 3D sphere
  - **Mouse Aim + Left Click (`LMB`)** — snap-flick **Resonance Nodes** or fire precision-crit **Focused Prism Lances** at enemies; **Hold `LMB`** on moving **Smooth Track Orbs** to charge **Arc Overload**
  - `Space` / `Shift` / Right Click (`RMB`) — Phase Dash (grants brief altitude jump + i-frames + blast)
  - `1` / `2` / `3` — pick shard upgrade (`R` Reroll, `X` Skip) · `Esc` — Pause & Build Spectrum
- **Twin-Stick Gamepad:** Left stick / D-pad move · **Right stick** steers the optical focus reticle · `RT`/`RB` fire/track · `A`/`LT` dash · `Start` pause · D-pad + `A`/`Y`/`B` in shard picker
- **Touch:** Drag anywhere for a virtual analog stick · Double-tap to Dash

## Core Loop & FPS Aim-Trainer Overdrive

1. **Survive 15:00 or Shatter 3 Bosses** (*Prism Sentinel*, *Hydra*, and the *Void Prism* — then unlock **Endless Overdrive**).
2. **Collect Diamond Radiance Gems → Evolve Your Spectrum:** Choose from **23 shards**, **19 synergies**, and **5 level-6 evolutions** on holographic 3D-tilt prism cards with bespoke optical SVG glyphs and live synergy-unlock callouts.
3. **Optional Bonus Skill Layer — FPS Aim-Trainer Resonance Drills (Adaptive Tiers 1–10):**
   - **Flick Chain (Wide-Angle Flicking & Target Switching):** Snap-click a sequence of 3–5 shrinking golden nodes linked by guiding vectors to detonate a **Prismatic Supernova**.
   - **Smooth Tracking (Continuous Velocity-Matched Tracking):** Hold `LMB` / `RT` smoothly over a weaving **Kinetic Track Orb** to charge its lock ring to 100% and unleash **Arc Overload** chain lightning.
   - **Micro-Cluster (Precision Micro-Adjustments):** Rapidly shatter 3 tight ruby-gold nodes to trigger **Triple Prism Convergence** cross-slicing rail beams.
   - **Direct Precision Crits:** Clicking directly on any enemy or boss fires a high-damage piercing **Focused Prism Lance** (live accuracy %, tier, and chain combo tracked in HUD & post-run dossier).

## Procedural Classic & Modern Adaptive Soundtrack (`web/src/music.ts`)

100% real-time Web Audio synthesis driven by a sample-accurate lookahead scheduler — zero external audio files:
- **6 Distinct 8-Bar Movements** that evolve organically through your run:
  1. *I. Crystal Overture* (`D Dorian`, 118 BPM) — extended 9th/11th voicings & atmospheric pulse
  2. *II. Refraction Lift* (`F Lydian`, 122 BPM) — uplifting relative-major modal modulation & synthwave drive
  3. *III. Prismatic Counterpoint* (`D Harmonic Minor`, 124 BPM) — Bach-inspired 16th FM-harp arpeggios over a descending chromatic bassline (`Dm → Dm/C → Bbmaj7 → A7/C# → Eø7 → A7b9`)
  4. *IV. Chromatic Horizon* (`Modal Interchange`, 120 BPM) — Neo-Riemannian chromatic mediants (`Dm9 → F#maj7 → Bm9`) & Neapolitan `bII` (`Ebmaj7`) half-time cinema groove
  5. *V. Solar Overdrive* (`A Dorian`, 128 BPM) — high-energy climax with twin harmony leads
  6. *Boss · Void Convergence* (`D Phrygian Dominant`, 134 BPM) — seamless bar-boundary boss transition with double-kick urgency & offbeat brass stabs
- **Harmonically-Locked SFX (`web/src/audio.ts`):** Gem pickup cascades, Aim-Trainer flick snaps, and Overdrive detonations pull consonant frequencies directly from the currently sounding chord in `MusicEngine` (*Rez Infinite*-style harmonic cohesion), with independent **Music** and **SFX** toggles.

## Spectral WebGL2 Rendering Pipeline

- **Anti-Whiteout Chroma-Preserving Thin-Film Tone Mapping:** Replaces blinding additive whiteouts in 1,600-beam late-game storms with dynamic per-beam density attenuation (`u_beam_density`) and thin-film optical interference fringes so dense overlaps refract into vivid jewel filaments.
- **4-Level Dual Kawase HDR Bloom Pyramid** (`1/2 → 1/4 → 1/8 → 1/16` down + 8-tap additive tent up) + temporal persistence + WebGL context loss/restore recovery.
- **GPU Faceted Geometric SDFs:** Spinning 6-faceted rainbow player prism, diamond gems, beveled crystal hexes, sharp chevron drones, 8-point starburst elites/bosses, and hollow chromatic wave rings over an anti-aliased sapphire Fresnel globe and procedural starfield.

## Local Development

```bash
# Run deterministic Rust simulation, spatial-grid, boss-relief & aim-trainer tests (21 tests)
cargo test

# Build optimized release WebAssembly module
wasm-pack build --release --target web --out-dir web/wasm --out-name prism

# Typecheck & run Vite dev server
cd web
npm ci
npm run dev
```

## Layout

```
prism-game/
├── src/
│   ├── lib.rs                      #[wasm_bindgen] surface + #[repr(C)] zero-copy GPU/popup/aim structs
│   ├── game.rs                     Simulation, globe geodesics, bosses, endless mode, FPS aim-trainer drills
│   ├── spatial.rs                  Zero-allocation flat spatial hash grid (O(N) broadphase & separation)
│   ├── shards.rs                   23 shard operators, 19 synergies, 5 evolutions, compose_salvo
│   ├── entities.rs                 Plain data structs
│   ├── math.rs                     Deterministic seeded xorshift RNG
│   └── game_tests.rs               21 deterministic unit/smoke/aim/endless tests + boss TTK harness
└── web/
    ├── index.html                  Bespoke chamfered UI, Title Screen, Holographic Picker, Run Story Recap
    ├── public/                     Strict CSP _headers + geometric SVG favicon
    └── src/
        ├── main.ts                 Bootstrap, RAF loop, mouse-reactive title globe, HUD, Daily & Endless
        ├── renderer.ts             WebGL2 5-pass Dual Kawase HDR pipeline + beam density attenuation
        ├── shaders.ts              GLSL 300 ES — faceted SDFs, beams, globe/starfield, thin-film tonemap
        ├── overlay.ts              2D canvas optical crosshair, aim drill gauges, damage numbers, boss arrow
        ├── music.ts                6-movement classic/modern adaptive synth & drum soundtrack engine
        ├── audio.ts                Harmonically-locked crystalline modal SFX + smooth tracking shimmer
        ├── shardIcons.ts           23 bespoke inline-SVG optical shard emblems + 5 evolution glyphs
        └── input.ts                Keyboard, Mouse aiming/clicking/tracking, Touch & Twin-Stick Gamepad
```
