# Prism

Auto-firing light, refracted through shards you collect. A Vampire-Survivors-paced action game rendered as geometric light, built in Rust + WASM, deployed to Cloudflare Workers.

**Current stage: step 1 — pipeline alive.** A WASM module ticks a clock, a canvas renders a pulsing point of light, and pushing to `main` deploys the whole thing.

## Stack

- **Rust** → `wasm-pack` → WebAssembly (game state, simulation)
- **TypeScript** + **Vite** (bootstrap, renderer, audio — later)
- **Cloudflare Workers** static assets via **Wrangler**
- **GitHub Actions** deploys on push

## Prerequisites

- Rust (stable) — the toolchain is pinned in `rust-toolchain.toml`
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)
- Node 22+

## Local development

Build the Rust module, then run Vite:

```bash
# From the repo root. Rebuild this whenever src/*.rs changes.
wasm-pack build --target web --out-dir web/wasm --out-name prism --dev

# Then, in another terminal:
cd web
npm install
npm run dev
```

Open http://localhost:5173. You should see a faint violet vignette and a softly pulsing white dot in the center of the screen.

## Deploy

One-time setup — add two secrets in your GitHub repo settings:

- `CLOUDFLARE_API_TOKEN` — a token with the **Workers Scripts: Edit** permission (create at https://dash.cloudflare.com/profile/api-tokens)
- `CLOUDFLARE_ACCOUNT_ID` — from the right-hand sidebar of your Cloudflare dashboard

Then:

```bash
git init
git add .
git commit -m "step 1: pipeline alive"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

The workflow in `.github/workflows/deploy.yml` runs, builds WASM + the web bundle, and deploys. First deploy takes ~2–3 minutes; subsequent deploys ~45s with caching. The game goes live at `https://prism.<your-subdomain>.workers.dev`.

If you want a different Worker name, edit `name` in `wrangler.toml` before the first deploy.

## Layout

```
prism/
├── Cargo.toml                      Rust package manifest
├── rust-toolchain.toml             Pinned Rust channel
├── src/
│   └── lib.rs                      WASM entry + Game struct
├── web/
│   ├── index.html                  Canvas host
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       └── main.ts                 Bootstrap + RAF loop
├── wrangler.toml                   Cloudflare Workers config
├── .github/workflows/deploy.yml    CI
└── .gitignore
```

## Roadmap

1. ✅ Pipeline alive (this step)
2. WebGL2 renderer — additive beams, bloom post-process, one enemy type, collision
3. Shard system — all 10 operators, level-up UI, the compounding visuals
4. Procedural audio — Web Audio synth voices locked to a music clock
5. Waves, Nightfall boss, meta progression, polish
