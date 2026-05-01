# Prism Agent Notes

Prism is a Rust/WASM browser bullet-heaven with a TypeScript/WebGL2 front end. The Rust simulation under `src/` builds to `web/wasm/`, and Vite serves the game from `web/`.

## Repository And Deployment

- GitHub source of truth: `https://github.com/eric-rolph/prism-game`.
- Work should land through GitHub, not just remain local. Use a branch, push it, open a PR, and merge to `main` when the change is ready.
- `.github/workflows/deploy.yml` runs on pushes to `main`. It builds the release WASM, builds the web bundle, and deploys the Worker/static assets with Wrangler.
- Cloudflare deployment is therefore validated by GitHub Actions after merge. Do not treat `web/dist/` or a local Wrangler run as the final live deploy.

## Local Development

```bash
wasm-pack build --target web --out-dir web/wasm --out-name prism --dev
cd web
npm install
npm run dev
```

Open `http://localhost:5173`.

For production parity, use the same sequence as CI:

```bash
wasm-pack build --release --target web --out-dir web/wasm --out-name prism
cd web
npm ci
npm run build
```

## Working Rules

- Check `git status` before editing and preserve unrelated local changes.
- If you change Rust exports or simulation behavior, rebuild `web/wasm/` so TypeScript declarations and the generated WASM glue stay in sync.
- Keep `web/src/main.ts` metadata arrays in index-lock with Rust enums and tables in `src/shards.rs`.
- Treat `docs/DEVELOPMENT_ROADMAP.md` as the living planning source. Older docs are useful history, but the roadmap wins when statuses disagree.
- `src/game.rs` is intentionally doing a lot today; prefer small, low-risk extractions around stable subsystems rather than broad rewrites during feature work.
