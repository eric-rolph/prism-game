// Step 1 bootstrap: load the WASM module, open a canvas, run the loop.
// Renders with Canvas 2D intentionally — we swap to WebGL2 in step 2 once we
// know the deploy pipeline is healthy.

import init, { Game } from '../wasm/prism.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLDivElement;
const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) {
  status.textContent = 'canvas 2d unavailable';
  throw new Error('canvas 2d unavailable');
}

// Device-pixel-ratio-aware sizing. Capped at 2x to keep fill rate reasonable
// on high-DPI phones.
function resize(game?: Game) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  // The Rust side stores the player position; in step 1 we don't resync it
  // on resize — the camera is screen-space and the player pins to center via
  // the renderer. Step 2 will formalize this.
  void game;
}

window.addEventListener('resize', () => resize());

async function main() {
  await init();
  resize();
  const game = new Game(canvas.width, canvas.height);
  status.textContent = 'prism / step 1 — wasm alive';

  let last = performance.now();

  const frame = (now: number) => {
    // Clamp dt to avoid huge jumps after tab-backgrounding.
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    game.update(dt);

    const t = game.time();
    const w = canvas.width;
    const h = canvas.height;

    // Clear.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Subtle violet vignette to set the mood.
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    bg.addColorStop(0, 'rgba(30, 20, 55, 0.35)');
    bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // The player: a pulsing point of light.
    const px = game.player_x();
    const py = game.player_y();
    const pulse = 4 + Math.sin(t * 2.2) * 1.5;

    // Halo.
    const halo = ctx.createRadialGradient(px, py, 0, px, py, 90);
    halo.addColorStop(0, 'rgba(200, 180, 255, 0.35)');
    halo.addColorStop(0.5, 'rgba(160, 140, 255, 0.08)');
    halo.addColorStop(1, 'rgba(160, 140, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(px - 90, py - 90, 180, 180);

    // Core.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, pulse, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  status.textContent = 'failed to load — see console';
});
