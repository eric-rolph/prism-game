// Input aggregation. Maintains the current intent as a 2D vector; game code
// reads via `direction()` once per frame. Both keyboard and touch drag are
// supported; touch produces an analog magnitude scaled by drag distance.
//
// Mobile: drag = move, double-tap = dash/jump. Lifting the finger keeps momentum
// for ~200 ms so the player doesn't snap to a stop mid-maneuver.

const KEYS_LEFT = new Set(['ArrowLeft', 'a', 'A']);
const KEYS_RIGHT = new Set(['ArrowRight', 'd', 'D']);
const KEYS_UP = new Set(['ArrowUp', 'w', 'W']);
const KEYS_DOWN = new Set(['ArrowDown', 's', 'S']);

const MOMENTUM_DECAY_MS = 200; // touch-lift momentum lingers this long
const DOUBLE_TAP_MS = 320;     // max gap between taps to count as double-tap

export class Input {
  private pressed = new Set<string>();
  private touchStart: { x: number; y: number } | null = null;
  private touchCurrent: { x: number; y: number } | null = null;
  private touchStartTime = 0;
  private _dashPressed = false;

  // Touch momentum state.
  private momentumX = 0;
  private momentumY = 0;
  private touchEndTime = 0; // performance.now() when last touch ended

  // Double-tap detection.
  private lastTapTime = 0;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Shift') {
        this._dashPressed = true;
        e.preventDefault();
        return;
      }
      if (this.isTracked(e.key)) {
        this.pressed.add(e.key);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.key);
    });
    window.addEventListener('blur', () => this.pressed.clear());

    target.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0];
        if (t) {
          this.touchStart = this.touchCurrent = { x: t.clientX, y: t.clientY };
          this.touchStartTime = performance.now();
        }
        e.preventDefault();
      },
      { passive: false },
    );
    target.addEventListener(
      'touchmove',
      (e) => {
        const t = e.touches[0];
        if (t) this.touchCurrent = { x: t.clientX, y: t.clientY };
        e.preventDefault();
      },
      { passive: false },
    );
    const end = () => {
      const now = performance.now();
      if (this.touchStart && this.touchCurrent) {
        const dx = this.touchCurrent.x - this.touchStart.x;
        const dy = this.touchCurrent.y - this.touchStart.y;
        const moved = Math.hypot(dx, dy);
        const elapsed = now - this.touchStartTime;

        if (moved < 12 && elapsed < 220) {
          // Tap: check for double-tap to trigger dash.
          if (now - this.lastTapTime < DOUBLE_TAP_MS) {
            this._dashPressed = true;
            this.lastTapTime = 0; // reset so triple-tap doesn't re-fire
          } else {
            this.lastTapTime = now;
          }
          // No momentum on a tap — player was stationary.
          this.momentumX = 0;
          this.momentumY = 0;
        } else {
          // Drag end: carry momentum so lifting doesn't feel sticky.
          const scale = 80;
          this.momentumX = Math.max(-1, Math.min(1, dx / scale));
          this.momentumY = Math.max(-1, Math.min(1, dy / scale));
        }
      }
      this.touchEndTime = now;
      this.touchStart = null;
      this.touchCurrent = null;
    };
    target.addEventListener('touchend', end);
    target.addEventListener('touchcancel', end);
  }

  private isTracked(key: string): boolean {
    return KEYS_LEFT.has(key) || KEYS_RIGHT.has(key) || KEYS_UP.has(key) || KEYS_DOWN.has(key);
  }

  /// Returns the current movement direction in [-1, 1]^2. Magnitude ≤ 1.
  direction(): [number, number] {
    // Active touch drag takes full precedence.
    if (this.touchStart && this.touchCurrent) {
      const dx = this.touchCurrent.x - this.touchStart.x;
      const dy = this.touchCurrent.y - this.touchStart.y;
      const scale = 80;
      const nx = Math.max(-1, Math.min(1, dx / scale));
      const ny = Math.max(-1, Math.min(1, dy / scale));
      return [nx, ny];
    }

    // Touch momentum decay after finger lifts.
    const elapsed = performance.now() - this.touchEndTime;
    if (elapsed < MOMENTUM_DECAY_MS && (Math.abs(this.momentumX) > 0.05 || Math.abs(this.momentumY) > 0.05)) {
      const t = 1 - elapsed / MOMENTUM_DECAY_MS; // 1→0 over decay window
      return [this.momentumX * t, this.momentumY * t];
    }

    // Keyboard input.
    let x = 0;
    let y = 0;
    for (const k of this.pressed) {
      if (KEYS_LEFT.has(k)) x -= 1;
      if (KEYS_RIGHT.has(k)) x += 1;
      if (KEYS_UP.has(k)) y -= 1;
      if (KEYS_DOWN.has(k)) y += 1;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return [x, y];
  }

  consumeDash(): boolean {
    const v = this._dashPressed;
    this._dashPressed = false;
    return v;
  }

  clearKeys(): void {
    this.pressed.clear();
    this._dashPressed = false;
    this.momentumX = 0;
    this.momentumY = 0;
  }
}
