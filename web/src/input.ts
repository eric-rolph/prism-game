// Input aggregation. Maintains the current intent as a 2D vector; game code
// reads via `direction()` once per frame. Both keyboard and touch drag are
// supported; touch produces an analog magnitude scaled by drag distance.

const KEYS_LEFT = new Set(['ArrowLeft', 'a', 'A']);
const KEYS_RIGHT = new Set(['ArrowRight', 'd', 'D']);
const KEYS_UP = new Set(['ArrowUp', 'w', 'W']);
const KEYS_DOWN = new Set(['ArrowDown', 's', 'S']);

export class Input {
  private pressed = new Set<string>();
  private touchStart: { x: number; y: number } | null = null;
  private touchCurrent: { x: number; y: number } | null = null;
  private _dashPressed = false;

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
        if (t) this.touchStart = this.touchCurrent = { x: t.clientX, y: t.clientY };
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
    // Touch drag takes precedence when active.
    if (this.touchStart && this.touchCurrent) {
      const dx = this.touchCurrent.x - this.touchStart.x;
      const dy = this.touchCurrent.y - this.touchStart.y;
      // Saturate drag at 80 px for full-speed movement.
      const scale = 80;
      const nx = Math.max(-1, Math.min(1, dx / scale));
      const ny = Math.max(-1, Math.min(1, dy / scale));
      return [nx, ny];
    }

    let x = 0;
    let y = 0;
    for (const k of this.pressed) {
      if (KEYS_LEFT.has(k)) x -= 1;
      if (KEYS_RIGHT.has(k)) x += 1;
      if (KEYS_UP.has(k)) y -= 1;
      if (KEYS_DOWN.has(k)) y += 1;
    }
    // Normalize diagonals so they aren't sqrt(2)× faster than cardinals.
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
}
