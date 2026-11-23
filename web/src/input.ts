// Unified Input Controller for Prism:
//   - Keyboard (WASD/Arrows move, Space/Shift dash)
//   - Mouse FPS Aim-Trainer Layer (cursor aims focal reticle, LMB snap-flick / hold-track, RMB dash)
//   - Twin-Stick Gamepad (Left stick/D-pad move, Right stick aims reticle, RT/RB fire/track, A/LT dash, Start pause)
//   - Touch (drag virtual analog stick + double-tap dash)

export type ModalGamepadAction = 'prev' | 'next' | 'confirm' | 'reroll' | 'skip' | null;

const STICK_DEADZONE = 0.16;

export interface AimInputState {
  offsetX: number; // px offset from viewport center
  offsetY: number;
  active: boolean;
  clicked: boolean;
  held: boolean;
}

export class Input {
  private keys = new Set<string>();
  private touchId: number | null = null;
  private touchOrigin: [number, number] = [0, 0];
  private touchVec: [number, number] = [0, 0];
  private dashPending = false;
  private pausePending = false;
  private lastTapTime = 0;

  // Mouse & Right-Stick Aim Reticle state (viewport-center relative).
  private aimX = 0;
  private aimY = 0;
  private aimActive = false;
  private aimUsingMouse = false;
  private mouseDown = false;
  private aimClickPending = false;

  // Gamepad live state + edge detection.
  private padVec: [number, number] = [0, 0];
  private padConnected = false;
  private padFireHeld = false;
  private prevPadDash = false;
  private prevPadFire = false;
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
      this.mouseDown = false;
      this.aimClickPending = false;
    });

    // Mouse FPS aiming & firing on canvas.
    window.addEventListener('mousemove', (e) => {
      this.aimX = e.clientX - window.innerWidth * 0.5;
      this.aimY = e.clientY - window.innerHeight * 0.5;
      this.aimActive = true;
      this.aimUsingMouse = true;
    });

    target.addEventListener('mousedown', (e) => {
      this.aimX = e.clientX - window.innerWidth * 0.5;
      this.aimY = e.clientY - window.innerHeight * 0.5;
      this.aimActive = true;
      this.aimUsingMouse = true;
      if (e.button === 0) {
        this.mouseDown = true;
        this.aimClickPending = true;
      } else if (e.button === 2) {
        this.dashPending = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
      }
    });

    target.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Touch drag virtual stick + double-tap dash.
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

  /** Poll connected standard gamepads once per animation frame (supports Twin-Stick aiming!). */
  public pollGamepad(modalOpen: boolean, dt = 1 / 60): void {
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
      this.padFireHeld = false;
      return;
    }
    this.padConnected = true;

    // Left stick + D-pad movement.
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

    // Right stick steers the Aim-Trainer Focal Reticle smoothly!
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    const rMag = Math.hypot(rx, ry);
    if (rMag > STICK_DEADZONE) {
      const rescaled = Math.min(1, (rMag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      const speed = 560 * dt;
      this.aimX += (rx / rMag) * rescaled * speed;
      this.aimY += (ry / rMag) * rescaled * speed;
      const maxX = window.innerWidth * 0.45;
      const maxY = window.innerHeight * 0.45;
      this.aimX = Math.max(-maxX, Math.min(maxX, this.aimX));
      this.aimY = Math.max(-maxY, Math.min(maxY, this.aimY));
      this.aimActive = true;
      this.aimUsingMouse = false;
    }

    const btnA = Boolean(pad.buttons[0]?.pressed);
    const btnB = Boolean(pad.buttons[1]?.pressed);
    const btnY = Boolean(pad.buttons[3]?.pressed);
    const btnLB = Boolean(pad.buttons[4]?.pressed);
    const btnRB = Boolean(pad.buttons[5]?.pressed);
    const btnLT = (pad.buttons[6]?.value ?? 0) > 0.45;
    const btnRT = (pad.buttons[7]?.value ?? 0) > 0.45;
    const btnStart = Boolean(pad.buttons[9]?.pressed);

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
      this.prevPadDash = btnA || btnLT;
      this.prevPadFire = btnRT || btnRB;
      this.padFireHeld = false;
    } else {
      // A or LT dashes; RT or RB fires/tracks Focused Prism Lance!
      const dashNow = btnA || btnLT;
      if (dashNow && !this.prevPadDash) {
        this.dashPending = true;
      }
      this.prevPadDash = dashNow;

      const fireNow = btnRT || btnRB;
      if (fireNow && !this.prevPadFire) {
        this.aimClickPending = true;
        this.aimActive = true;
      }
      this.padFireHeld = fireNow;
      this.prevPadFire = fireNow;

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

  public isMouseAiming(): boolean {
    return this.aimActive && this.aimUsingMouse;
  }

  public consumeAim(): AimInputState {
    const clicked = this.aimClickPending;
    this.aimClickPending = false;
    return {
      offsetX: this.aimX,
      offsetY: this.aimY,
      active: this.aimActive,
      clicked,
      held: this.mouseDown || this.padFireHeld,
    };
  }

  public peekAimOffset(): [number, number] {
    return [this.aimX, this.aimY];
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
    this.mouseDown = false;
    this.aimClickPending = false;
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
