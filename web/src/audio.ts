// Synthesized Web Audio event system — no asset files.
// Initialized on first user gesture; all sounds routed through a master gain
// so the mix can be ducked while the level-up modal is open.

const AUDIO_RANK_UP      = 1 << 0;
const AUDIO_PLAYER_HIT   = 1 << 1;
const AUDIO_BOSS_SPAWN   = 1 << 2;
const AUDIO_BOSS_PHASE   = 1 << 3;
const AUDIO_SHIELD_BREAK = 1 << 4;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private isMuted = false;
  private beamBed: GainNode | null = null;
  private beamOscA: OscillatorNode | null = null;
  private beamOscB: OscillatorNode | null = null;

  private beamCd = 0;
  private killCd = 0;
  private gemCd  = 0;
  private beamAccentIndex = 0;

  // Detect new synergy activations between frames.
  private prevSynergyBits = 0;

  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.createBeamBed();
  }

  resume(): void {
    this.ctx?.resume();
  }

  duck(on: boolean): void {
    if (!this.master || !this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelAndHoldAtTime(t);
    this.master.gain.linearRampToValueAtTime(on ? 0.1 : 0.5, t + 0.12);
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelAndHoldAtTime(t);
      this.master.gain.linearRampToValueAtTime(this.isMuted ? 0 : 0.5, t + 0.1);
    }
    return this.isMuted;
  }

  tick(dt: number, beams: number, kills: number, gems: number, events: number, synergyBits: number): void {
    if (!this.ctx) return;

    this.beamCd = Math.max(0, this.beamCd - dt);
    this.killCd = Math.max(0, this.killCd - dt);
    this.gemCd  = Math.max(0, this.gemCd  - dt);

    this.updateBeamBed(beams);
    if (beams > 0 && this.beamCd <= 0) {
      this.playBeamAccent(beams);
      this.beamCd = 0.18 + Math.random() * 0.16;
    }
    if (kills > 0 && this.killCd <= 0) { this.playKill(kills);   this.killCd = 0.04; }
    if (gems  > 0 && this.gemCd  <= 0) { this.playGem();         this.gemCd  = 0.07; }

    if (events & AUDIO_RANK_UP)      this.playRankUp();
    if (events & AUDIO_PLAYER_HIT)   this.playPlayerHit();
    if (events & AUDIO_BOSS_SPAWN)   this.playBossSpawn();
    if (events & AUDIO_BOSS_PHASE)   this.playBossPhase();
    if (events & AUDIO_SHIELD_BREAK) this.playShieldBreak();

    // Detect first-activation of any synergy.
    const newBits = synergyBits & ~this.prevSynergyBits;
    if (newBits) this.playSynergy();
    this.prevSynergyBits = synergyBits;
  }

  playDeath(): void {
    if (!this.ctx) return;
    this.note(349.23, 0.00, 0.55, 0.10);
    this.note(311.13, 0.18, 0.55, 0.10);
    this.note(261.63, 0.36, 0.80, 0.12);
  }

  playVictory(): void {
    if (!this.ctx) return;
    this.note(523.25, 0.00, 0.28, 0.08);
    this.note(659.25, 0.12, 0.28, 0.08);
    this.note(783.99, 0.24, 0.28, 0.08);
    this.note(1046.50, 0.36, 0.55, 0.10);
  }

  playJackpot(): void {
    if (!this.ctx) return;
    this.note(440, 0.00, 0.08, 0.20, 880);
    this.note(554.37, 0.10, 0.08, 0.20, 1108.73);
    this.note(659.25, 0.20, 0.12, 0.40, 1318.51);
  }

  playGlitch(): void {
    if (!this.ctx) return;
    this.note(110, 0.00, 0.18, 0.30, 55, 'sawtooth');
    this.note(82.41, 0.05, 0.20, 0.40, 41.20, 'square');
  }

  playSpin(): void {
    if (!this.ctx) return;
    this.note(880, 0.00, 0.06, 0.15, 440);
  }

  // --- Private synthesis -------------------------------------------------

  private createBeamBed(): void {
    const ctx = this.ctx!;
    const master = this.master!;
    const bed = ctx.createGain();
    bed.gain.value = 0.0001;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 760;
    filter.Q.value = 0.65;

    const oscA = ctx.createOscillator();
    oscA.type = 'triangle';
    oscA.frequency.value = 185;

    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 372;

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(bed);
    bed.connect(master);

    oscA.start();
    oscB.start();

    this.beamBed = bed;
    this.beamOscA = oscA;
    this.beamOscB = oscB;
  }

  private updateBeamBed(beams: number): void {
    if (!this.ctx || !this.beamBed || !this.beamOscA || !this.beamOscB) return;
    const t = this.ctx.currentTime;
    const active = beams > 0;
    const target = active ? Math.min(0.018 + beams * 0.003, 0.034) : 0.0001;

    this.beamBed.gain.cancelAndHoldAtTime(t);
    this.beamBed.gain.exponentialRampToValueAtTime(target, t + (active ? 0.045 : 0.18));

    if (active) {
      const drift = Math.random() * 8 - 4;
      this.beamOscA.frequency.setTargetAtTime(185 + drift, t, 0.08);
      this.beamOscB.frequency.setTargetAtTime(372 - drift * 1.7, t, 0.08);
    }
  }

  private playBeamAccent(beams: number): void {
    // The weapon bed carries continuous feedback; accents are intentionally
    // sparse and varied so the auto-fire never becomes a foreground metronome.
    const palette = [
      [880, 0.018, 0.055, 1180],
      [660, 0.016, 0.070, 990],
      [740, 0.014, 0.060, 520],
      [1040, 0.012, 0.045, 1560],
    ] as const;
    const variant = palette[this.beamAccentIndex % palette.length]!;
    this.beamAccentIndex += 1;
    const pitch = 0.94 + Math.random() * 0.12;
    const gain = variant[1] * Math.min(1.0 + beams * 0.08, 1.45);
    this.note(variant[0] * pitch, 0, gain, variant[2], variant[3] * pitch, 'triangle');
  }

  private playKill(count: number): void {
    const g = Math.min(count, 3) * 0.055;
    this.note(95, 0, g, 0.11, 32);
  }

  private playGem(): void {
    this.note(550, 0, 0.055, 0.065, 1050);
  }

  private playPlayerHit(): void {
    this.note(220, 0, 0.18, 0.14, 55);
  }

  private playRankUp(): void {
    this.note(523.25, 0.00, 0.07, 0.30);
    this.note(659.25, 0.06, 0.07, 0.28);
    this.note(783.99, 0.12, 0.08, 0.35);
  }

  private playSynergy(): void {
    this.note(587.33, 0.00, 0.07, 0.35);
    this.note(739.99, 0.08, 0.07, 0.35);
    this.note(987.77, 0.16, 0.09, 0.45);
  }

  private playBossSpawn(): void {
    this.note(55,  0.00, 0.14, 0.75, undefined, 'sine');
    this.note(110, 0.10, 0.07, 0.60, undefined, 'sine');
    this.note(220, 0.20, 0.04, 0.45, undefined, 'triangle');
  }

  private playBossPhase(): void {
    this.note(330, 0.00, 0.08, 0.25, 220);
    this.note(440, 0.12, 0.07, 0.25, 330);
  }

  private playShieldBreak(): void {
    this.note(1800, 0.00, 0.09, 0.10, 900);
    this.note(900,  0.06, 0.07, 0.10, 450);
    this.note(450,  0.12, 0.06, 0.14, 200);
  }

  // Single voice: oscillator with exponential frequency sweep + gain envelope.
  private note(
    freqStart: number,
    delayS: number,
    gainPeak: number,
    duration: number,
    freqEnd?: number,
    type: OscillatorType = 'sine',
  ): void {
    const ctx = this.ctx!;
    const master = this.master!;
    const t = ctx.currentTime + delayS;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
    }

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + duration + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
