# Prism

Auto-firing light, refracted through shards you collect. A Vampire-Survivors-paced action game rendered as geometric light, built in Rust + WASM, deployed to Cloudflare Workers.

**Controls:** WASD or arrow keys. On touch devices, drag anywhere — it becomes a virtual analog stick. When a rank-up modal appears, click a card or press `1` / `2` / `3`.

## Stack

- **Rust** → `wasm-pack` → WebAssembly (simulation, shard logic, collision)
- **WebGL2** + **TypeScript** + **Vite** (renderer, HUD, bootstrap)
- **Cloudflare Workers** static assets via **Wrangler**
- **GitHub Actions** deploys on push to `main`

## Architecture

Two passes. Pass one draws instanced SDF circles (player, enemies, particles, pulses) and SDF capsules (beams) into an offscreen RGBA8 framebuffer with additive blending. Pass two generates mipmaps on that framebuffer and runs a full-screen composite that samples mip levels 2/4/6 for cheap multi-scale bloom, applies radial chromatic aberration, a subtle vignette, Reinhard tonemap, and gamma correction.

The WASM↔JS boundary is zero-copy. Rust packs each frame's draw calls into two flat `Vec<CircleInstance>` / `Vec<BeamInstance>` buffers with `#[repr(C)]`; JavaScript reads the pointers + lengths and creates `Float32Array` views directly over WASM linear memory. The GPU instance buffer is filled with the same bytes Rust wrote. No serialization, no marshalling.

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
│   ├── game.rs                     State, update loop
│   ├── shards.rs                   The 16 shard operators
│   ├── entities.rs                 Plain data structs
│   └── math.rs                     Seeded xorshift RNG
├── web/
│   ├── index.html                  Canvas + HUD
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts                 Bootstrap + RAF loop + HUD/modal
│       ├── renderer.ts             WebGL2 pipeline
│       ├── shaders.ts              GLSL 300 ES sources
│       └── input.ts                Keyboard + touch
├── wrangler.toml                   Cloudflare Workers config
├── .github/workflows/deploy.yml    CI
└── .gitignore
```

## Roadmap

1. ✅ Pipeline alive
2. ✅ WebGL2 renderer — SDF circles + beams, additive blend, mip-based bloom, radial chromatic aberration, Reinhard tonemap
3. ✅ Shard system — 16 operators, level-up picker, rarity tags, active/near synergy HUD
4. ✅ Survival structure — 15-minute session, wave pressure, enemy roles, XP gems, dash, death/victory screens
5. Boss milestones — Sentinel shipped; Hydra and Void Prism next
6. Upgrade economy — skip/reroll, passive shards, level-6 evolutions
7. Procedural audio — Web Audio event voices for beams, gems, rank-ups, synergies, bosses, victory/death
8. Run goals — post-run stats, local high scores, optional endless mode
