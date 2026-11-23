// Keyboard (WASD/Arrows + Space/Shift Dash), Touch virtual analog stick (drag + double-tap dash),
// and Gamepad API controller support (left stick / D-pad, A/RB/RT dash, Start pause, modal nav).

export type ModalGamepadAction = 'prev' | 'next' | 'confirm' | 'reroll' | 'skip' | null;

const STICK_DEADZONE = 0.16;

export class Input {
  private keys = new Set<string>();
  private touchId: number | null = null;
  private touchOrigin: [number, number] = [0, 0];
  private touchVec: [number, number] = [0, 0];
  private dashPending = false;
  private pausePending = false;
  private lastTapTime = 0;

  // Gamepad live state + edge detection.
  private padVec: [number, number] = [0, 0];
  private padConnected = false;
  private prevPadDash = false;
  private prevPadPause = false;
  private prevPadLeft = false;
  private prevPadRight = false;
  private prevPadConfirm = false;
  private prevPadReroll = false;
  private prevPadSkip = false;
  private modalActionQueue: ModalGamepadAction[] = [];

  private readonly touchRadius = 56;
  private readonly doubleTapMs = 300;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.dashPending = true;
      }
      if (
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space'
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchId = null;
      this.touchVec = [0, 0];
      this.dashPending = false;
    });

    target.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const now = performance.now();
        if (now - this.lastTapTime < this.doubleTapMs) {
          this.dashPending = true;
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
        }
        if (this.touchId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        this.touchId = t.identifier;
        this.touchOrigin = [t.clientX, t.clientY];
        this.touchVec = [0, 0];
      },
      { passive: false },
    );

    target.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t && t.identifier === this.touchId) {
            const dx = t.clientX - this.touchOrigin[0];
            const dy = t.clientY - this.touchOrigin[1];
            const len = Math.hypot(dx, dy);
            if (len < 6) {
              this.touchVec = [0, 0];
            } else {
              const scale = Math.min(len, this.touchRadius) / this.touchRadius;
              this.touchVec = [(dx / len) * scale, (dy / len) * scale];
            }
          }
        }
      },
      { passive: false },
    );

    const endTouch = (e: TouchEvent): void => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t && t.identifier === this.touchId) {
          this.touchId = null;
          this.touchVec = [0, 0];
        }
      }
    };
    target.addEventListener('touchend', endTouch, { passive: true });
    target.addEventListener('touchcancel', endTouch, { passive: true });
  }

  /** Poll connected standard gamepads once per animation frame. */
  public pollGamepad(modalOpen: boolean): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        pad = p;
        break;
      }
    }

    if (!pad) {
      this.padConnected = false;
      this.padVec = [0, 0];
      return;
    }
    this.padConnected = true;

    // Analog left stick with radial deadzone + D-pad digital override.
    let ax = pad.axes[0] ?? 0;
    let ay = pad.axes[1] ?? 0;
    const mag = Math.hypot(ax, ay);
    if (mag < STICK_DEADZONE) {
      ax = 0;
      ay = 0;
    } else {
      const rescaled = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      ax = (ax / mag) * rescaled;
      ay = (ay / mag) * rescaled;
    }

    const dUp = Boolean(pad.buttons[12]?.pressed);
    const dDown = Boolean(pad.buttons[13]?.pressed);
    const dLeft = Boolean(pad.buttons[14]?.pressed);
    const dRight = Boolean(pad.buttons[15]?.pressed);
    if (dLeft) ax = -1;
    if (dRight) ax = 1;
    if (dUp) ay = -1;
    if (dDown) ay = 1;
    this.padVec = [ax, ay];

    const btnA = Boolean(pad.buttons[0]?.pressed);
    const btnB = Boolean(pad.buttons[1]?.pressed);
    const btnY = Boolean(pad.buttons[3]?.pressed);
    const btnLB = Boolean(pad.buttons[4]?.pressed);
    const btnRB = Boolean(pad.buttons[5]?.pressed);
    const btnRT = (pad.buttons[7]?.value ?? 0) > 0.45;
    const btnStart = Boolean(pad.buttons[9]?.pressed);

    // Pause edge detection.
    if (btnStart && !this.prevPadPause) {
      this.pausePending = true;
    }
    this.prevPadPause = btnStart;

    if (modalOpen) {
      const goLeft = dLeft || btnLB || ax < -0.65;
      const goRight = dRight || btnRB || ax > 0.65;
      if (goLeft && !this.prevPadLeft) this.modalActionQueue.push('prev');
      if (goRight && !this.prevPadRight) this.modalActionQueue.push('next');
      if (btnA && !this.prevPadConfirm) this.modalActionQueue.push('confirm');
      if (btnY && !this.prevPadReroll) this.modalActionQueue.push('reroll');
      if (btnB && !this.prevPadSkip) this.modalActionQueue.push('skip');
      this.prevPadLeft = goLeft;
      this.prevPadRight = goRight;
      this.prevPadConfirm = btnA;
      this.prevPadReroll = btnY;
      this.prevPadSkip = btnB;
      this.prevPadDash = btnA || btnRB || btnRT;
    } else {
      const dashNow = btnA || btnRB || btnRT;
      if (dashNow && !this.prevPadDash) {
        this.dashPending = true;
      }
      this.prevPadDash = dashNow;
      this.prevPadLeft = false;
      this.prevPadRight = false;
      this.prevPadConfirm = btnA;
      this.prevPadReroll = btnY;
      this.prevPadSkip = btnB;
    }
  }

  public hasGamepad(): boolean {
    return this.padConnected;
  }

  public consumeDash(): boolean {
    const p = this.dashPending;
    this.dashPending = false;
    return p;
  }

  public consumePause(): boolean {
    const p = this.pausePending;
    this.pausePending = false;
    return p;
  }

  public consumeModalAction(): ModalGamepadAction {
    return this.modalActionQueue.shift() ?? null;
  }

  public clearKeys(): void {
    this.keys.clear();
    this.touchId = null;
    this.touchVec = [0, 0];
    this.dashPending = false;
    this.pausePending = false;
    this.modalActionQueue.length = 0;
  }

  public direction(): [number, number] {
    if (this.touchId !== null) {
      return this.touchVec;
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;

    if (x === 0 && y === 0 && this.padConnected) {
      return this.padVec;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? [x / len, y / len] : [x, y];
  }
}
