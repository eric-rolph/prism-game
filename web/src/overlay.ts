// Lightweight 2D Canvas Tactical & Aim-Trainer Overlay layered over WebGL2:
//   - FPS Aim-Trainer Optical Crosshair (tightens & turns gold on hover, pulses on hit/miss)
//   - Resonance Drill visual cues (Flick Chain tether vector + step number, Smooth Track charge arc, Micro triangle links)
//   - Coalesced floating damage / crit / heal / shatter numbers
//   - Milestone / synergy / evolution / drill completion callouts
//   - Off-screen directional boss chevron tracker

const POPUP_STRIDE_FLOATS = 4;
const AIM_TARGET_STRIDE_FLOATS = 8;
const MAX_ACTIVE_POPUPS = 68;

interface FloatingNumber {
  wx: number;
  wy: number;
  value: number;
  kind: number; // 0 = normal, 1 = crit/boss/heavy, 2 = heal, 3 = break
  age: number;
  maxAge: number;
  driftX: number;
}

interface FloatingBanner {
  text: string;
  subtext: string;
  color: string;
  age: number;
  maxAge: number;
}

export interface AimOverlayState {
  active: boolean;
  offsetX: number;
  offsetY: number;
  hovering: boolean;
  tracking: boolean;
  trackProgress: number;
  hasPrevLink: boolean;
  lastHitX: number;
  lastHitY: number;
  targetsView: Float32Array;
  targetsLen: number;
}

export class OverlayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private popups: FloatingNumber[] = [];
  private banners: FloatingBanner[] = [];
  private viewW = 1;
  private viewH = 1;
  private dpr = 1;
  private enabled = true;
  private hitMarkerTimer = 0;
  private missMarkerTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for #overlay-canvas');
    this.ctx = ctx;
  }

  public resize(viewW: number, viewH: number, dpr: number): void {
    this.viewW = Math.max(1, viewW);
    this.viewH = Math.max(1, viewH);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(this.viewW * dpr));
    this.canvas.height = Math.max(1, Math.floor(this.viewH * dpr));
    this.canvas.style.width = this.viewW + 'px';
    this.canvas.style.height = this.viewH + 'px';
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.popups.length = 0;
  }

  public pulseHitMarker(): void {
    this.hitMarkerTimer = 0.16;
  }

  public pulseMissMarker(): void {
    this.missMarkerTimer = 0.14;
  }

  public clear(): void {
    this.popups.length = 0;
    this.banners.length = 0;
    this.hitMarkerTimer = 0;
    this.missMarkerTimer = 0;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.viewW, this.viewH);
  }

  public announce(text: string, color = '#a8f4ff', subtext = ''): void {
    this.banners.push({
      text,
      subtext,
      color,
      age: 0,
      maxAge: 2.1,
    });
    if (this.banners.length > 3) this.banners.shift();
  }

  public ingestPopups(view: Float32Array, count: number): void {
    if (!this.enabled || count <= 0) return;

    for (let i = 0; i < count; i++) {
      const base = i * POPUP_STRIDE_FLOATS;
      const wx = view[base]!;
      const wy = view[base + 1]!;
      const val = view[base + 2]!;
      const kind = Math.round(view[base + 3]!);

      let merged = false;
      if (kind !== 3) {
        for (let j = this.popups.length - 1; j >= Math.max(0, this.popups.length - 18); j--) {
          const p = this.popups[j]!;
          if (p.kind === kind && p.age < 0.14) {
            const dx = p.wx - wx;
            const dy = p.wy - wy;
            if (dx * dx + dy * dy < 32 * 32) {
              p.value += val;
              p.age = Math.min(p.age, 0.04);
              merged = true;
              break;
            }
          }
        }
      }

      if (!merged) {
        if (this.popups.length >= MAX_ACTIVE_POPUPS) this.popups.shift();
        this.popups.push({
          wx,
          wy,
          value: val,
          kind,
          age: 0,
          maxAge: kind === 3 ? 1.15 : kind === 1 ? 0.78 : 0.62,
          driftX: ((i * 37) % 19 - 9) * 1.4,
        });
      }
    }
  }

  private projectToScreen(
    wx: number,
    wy: number,
    camX: number,
    camY: number,
    shakeX: number,
    shakeY: number,
    arenaRadius: number,
  ): [number, number] | null {
    const rx = wx - camX;
    const ry = wy - camY;
    const dist = Math.hypot(rx, ry);
    const horizon = arenaRadius * 1.5707963;
    if (dist > horizon) return null;
    const theta = dist / Math.max(arenaRadius, 1);
    const scale = theta < 0.0001 ? 1 : Math.sin(theta) / theta;
    return [
      rx * scale + shakeX + this.viewW * 0.5,
      ry * scale + shakeY + this.viewH * 0.5,
    ];
  }

  public render(
    dt: number,
    camX: number,
    camY: number,
    shakeX: number,
    shakeY: number,
    arenaRadius: number,
    bossActive: boolean,
    bossX: number,
    bossY: number,
    bossLabel: string,
    aim: AimOverlayState,
  ): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    this.missMarkerTimer = Math.max(0, this.missMarkerTimer - dt);

    // 1. FPS Aim-Trainer Resonance Node gauges, flick tethers, and micro-cluster links.
    if (aim.targetsLen > 0) {
      const microPts: [number, number][] = [];

      for (let i = 0; i < aim.targetsLen; i++) {
        const base = i * AIM_TARGET_STRIDE_FLOATS;
        const wx = aim.targetsView[base]!;
        const wy = aim.targetsView[base + 1]!;
        const radius = aim.targetsView[base + 2]!;
        const kind = Math.round(aim.targetsView[base + 3]!);
        const progress = aim.targetsView[base + 4]!;
        const lifeFrac = aim.targetsView[base + 5]!;
        const step = Math.round(aim.targetsView[base + 6]!);
        const total = Math.round(aim.targetsView[base + 7]!);

        const screen = this.projectToScreen(wx, wy, camX, camY, shakeX, shakeY, arenaRadius);
        if (!screen) continue;
        const [sx, sy] = screen;

        if (kind === 0) {
          // FLICK CHAIN: faint dashed guiding tether from previous flick hit!
          if (aim.hasPrevLink) {
            const prev = this.projectToScreen(
              aim.lastHitX, aim.lastHitY, camX, camY, shakeX, shakeY, arenaRadius,
            );
            if (prev) {
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 224, 102, 0.35)';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([5, 6]);
              ctx.beginPath();
              ctx.moveTo(prev[0], prev[1]);
              ctx.lineTo(sx, sy);
              ctx.stroke();
              ctx.restore();
            }
          }

          // Crisp outer countdown arc + step label.
          ctx.save();
          ctx.strokeStyle = '#ffe066';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 7, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * lifeFrac);
          ctx.stroke();

          ctx.font = '700 10px "Cascadia Mono", Consolas, ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff5cc';
          ctx.shadowColor = 'rgba(0,0,0,0.95)';
          ctx.shadowBlur = 4;
          ctx.fillText(`FLICK ${step}/${total}`, sx, sy - radius - 13);
          ctx.restore();
        } else if (kind === 1) {
          // SMOOTH TRACKING: circular charge progress gauge + HOLD cue!
          ctx.save();
          // Remaining time faint outer ring.
          ctx.strokeStyle = 'rgba(130, 210, 255, 0.32)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 10, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * lifeFrac);
          ctx.stroke();

          // Live tracking lock charge arc (0 → 100%).
          ctx.strokeStyle = aim.tracking ? '#7effd4' : '#70c8ff';
          ctx.shadowColor = aim.tracking ? '#7effd4' : '#70c8ff';
          ctx.shadowBlur = aim.tracking ? 14 : 6;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 4, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * progress);
          ctx.stroke();

          ctx.font = '700 10px "Cascadia Mono", Consolas, ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = aim.tracking ? '#a8ffdf' : '#bceeff';
          ctx.shadowColor = 'rgba(0,0,0,0.95)';
          ctx.shadowBlur = 4;
          const label = aim.tracking ? `LOCK ${Math.round(progress * 100)}%` : 'HOLD TO TRACK';
          ctx.fillText(label, sx, sy - radius - 16);
          ctx.restore();
        } else {
          // MICRO-CLUSTER: tight precision ruby-gold nodes.
          microPts.push([sx, sy]);
          ctx.save();
          ctx.strokeStyle = '#ff7eb6';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 5, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * lifeFrac);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw faint triangular constellation web connecting active Micro-Cluster nodes.
      if (microPts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 126, 182, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        for (let i = 0; i < microPts.length; i++) {
          const a = microPts[i]!;
          const b = microPts[(i + 1) % microPts.length]!;
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
        const anchor = microPts[0]!;
        ctx.font = '700 9px "Cascadia Mono", Consolas, ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffc2dd';
        ctx.fillText(`MICRO ×${microPts.length}`, anchor[0], anchor[1] - 24);
        ctx.restore();
      }
    }

    // 2. Floating damage / heal / shatter numbers.
    if (this.enabled && this.popups.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let writeIdx = 0;
      for (let i = 0; i < this.popups.length; i++) {
        const p = this.popups[i]!;
        p.age += dt;
        if (p.age >= p.maxAge) continue;
        this.popups[writeIdx++] = p;

        const screen = this.projectToScreen(p.wx, p.wy, camX, camY, shakeX, shakeY, arenaRadius);
        if (!screen) continue;

        const t = p.age / p.maxAge;
        const easeOut = 1 - (1 - t) * (1 - t);
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const sx = screen[0] + p.driftX * easeOut;
        const sy = screen[1] - 12 - easeOut * (p.kind === 3 ? 44 : 28);

        let text: string;
        let font: string;
        let fill: string;
        let glow: string;

        if (p.kind === 3) {
          text = 'OVERDRIVE!';
          font = '700 15px "Cascadia Mono", Consolas, ui-monospace, monospace';
          fill = '#fff2c2';
          glow = 'rgba(255, 200, 72, 0.92)';
        } else if (p.kind === 2) {
          text = `+${Math.round(p.value)}`;
          font = '600 12px "Cascadia Mono", Consolas, ui-monospace, monospace';
          fill = '#72ffbe';
          glow = 'rgba(102, 255, 168, 0.75)';
        } else if (p.kind === 1) {
          const val = Math.round(p.value);
          text = val >= 1000 ? `${(val / 1000).toFixed(1)}K` : `${val}`;
          font = '700 14px "Cascadia Mono", Consolas, ui-monospace, monospace';
          fill = '#ffe26a';
          glow = 'rgba(255, 210, 64, 0.85)';
        } else {
          const val = Math.round(p.value);
          text = val >= 1000 ? `${(val / 1000).toFixed(1)}K` : `${val}`;
          font = '500 11px "Cascadia Mono", Consolas, ui-monospace, monospace';
          fill = '#dcf8ff';
          glow = 'rgba(120, 224, 255, 0.55)';
        }

        const popScale = t < 0.14 ? 0.72 + (t / 0.14) * 0.42 : 1.14 - t * 0.18;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(sx, sy);
        ctx.scale(popScale, popScale);
        ctx.font = font;
        ctx.shadowColor = glow;
        ctx.shadowBlur = p.kind >= 1 ? 10 : 5;
        ctx.fillStyle = fill;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
      this.popups.length = writeIdx;
    }

    // 3. Off-screen directional boss chevron indicator.
    if (bossActive) {
      const rx = bossX - camX;
      const ry = bossY - camY;
      const dist = Math.hypot(rx, ry);
      const screen = this.projectToScreen(bossX, bossY, camX, camY, shakeX, shakeY, arenaRadius);
      const margin = 44;
      const onScreen =
        screen !== null &&
        screen[0] >= margin &&
        screen[0] <= this.viewW - margin &&
        screen[1] >= margin &&
        screen[1] <= this.viewH - margin;

      if (!onScreen && dist > 10) {
        const ang = Math.atan2(ry, rx);
        const cx = this.viewW * 0.5;
        const cy = this.viewH * 0.5;
        const hw = cx - 54;
        const hh = cy - 68;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const tx = Math.abs(cos) > 1e-4 ? hw / Math.abs(cos) : 1e9;
        const ty = Math.abs(sin) > 1e-4 ? hh / Math.abs(sin) : 1e9;
        const edgeDist = Math.min(tx, ty);
        const ex = cx + cos * edgeDist;
        const ey = cy + sin * edgeDist;

        const pulse = 0.72 + 0.28 * Math.sin(performance.now() * 0.008);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ff9c59';
        ctx.shadowColor = 'rgba(255, 110, 80, 0.9)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -9);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.font = '600 9px "Cascadia Mono", Consolas, ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd59e';
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 4;
        ctx.fillText(`${bossLabel} · ${Math.round(dist)}M`, ex, ey + 20);
        ctx.restore();
      }
    }

    // 4. Razor-sharp FPS Aim-Trainer Optical Crosshair (drawn over world when mouse/right-stick active).
    if (aim.active) {
      const cx = this.viewW * 0.5 + aim.offsetX;
      const cy = this.viewH * 0.5 + aim.offsetY;
      const gap = aim.hovering ? 5 : 9;
      const arm = aim.hovering ? 9 : 7;
      const color =
        this.missMarkerTimer > 0
          ? '#ff6b7f'
          : aim.tracking
            ? '#7effd4'
            : aim.hovering
              ? '#ffe26a'
              : '#b8f6ff';

      ctx.save();
      // Faint optical sightline from prism center to reticle.
      ctx.strokeStyle = aim.tracking
        ? 'rgba(126, 255, 212, 0.28)'
        : 'rgba(168, 244, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.viewW * 0.5 + shakeX, this.viewH * 0.5 + shakeY);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // Dynamic 4-tick FPS precision reticle.
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = aim.hovering || aim.tracking ? 12 : 6;
      ctx.lineWidth = aim.hovering ? 2 : 1.5;

      ctx.beginPath();
      ctx.moveTo(cx - gap - arm, cy);
      ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy);
      ctx.lineTo(cx + gap + arm, cy);
      ctx.moveTo(cx, cy - gap - arm);
      ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap);
      ctx.lineTo(cx, cy + gap + arm);
      ctx.stroke();

      // Crisp 2px center dot.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, aim.hovering ? 2.2 : 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Crisp X hit-marker flash on precision snap!
      if (this.hitMarkerTimer > 0) {
        const hm = this.hitMarkerTimer / 0.16;
        const d1 = 6 + (1 - hm) * 4;
        const d2 = d1 + 7;
        ctx.strokeStyle = '#ffe878';
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = hm;
        ctx.beginPath();
        ctx.moveTo(cx - d2, cy - d2);
        ctx.lineTo(cx - d1, cy - d1);
        ctx.moveTo(cx + d2, cy - d2);
        ctx.lineTo(cx + d1, cy - d1);
        ctx.moveTo(cx - d2, cy + d2);
        ctx.lineTo(cx - d1, cy + d1);
        ctx.moveTo(cx + d2, cy + d2);
        ctx.lineTo(cx + d1, cy + d1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Milestone / Synergy / Evolution / Drill Completion callout banners.
    if (this.banners.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < this.banners.length; i++) {
        const b = this.banners[i]!;
        b.age += dt;
        if (b.age >= b.maxAge) continue;
        this.banners[writeIdx++] = b;

        const t = b.age / b.maxAge;
        const fadeIn = Math.min(1, t / 0.12);
        const fadeOut = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
        const alpha = fadeIn * fadeOut;
        const y = this.viewH * 0.22 + i * 42 - (1 - fadeIn) * 10;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 15px "Cascadia Mono", Consolas, ui-monospace, monospace';
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 18;
        ctx.fillText(b.text, this.viewW * 0.5, y);

        if (b.subtext) {
          ctx.font = '500 10px "Cascadia Mono", Consolas, ui-monospace, monospace';
          ctx.fillStyle = 'rgba(226, 250, 255, 0.88)';
          ctx.shadowBlur = 6;
          ctx.fillText(b.subtext, this.viewW * 0.5, y + 18);
        }
        ctx.restore();
      }
      this.banners.length = writeIdx;
    }
  }
}
