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

  private beamCd = 0;
  private killCd = 0;
  private gemCd  = 0;

  // Detect new synergy activations between frames.
  private prevSynergyBits = 0;

  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  resume(): void {
    this.ctx?.resume();
  }

  duck(on: boolean): void {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelAndHoldAtTime(t);
    this.master.gain.linearRampToValueAtTime(on ? 0.1 : 0.5, t + 0.12);
  }

  tick(dt: number, beams: number, kills: number, gems: number, events: number, synergyBits: number): void {
    if (!this.ctx) return;

    this.beamCd = Math.max(0, this.beamCd - dt);
    this.killCd = Math.max(0, this.killCd - dt);
    this.gemCd  = Math.max(0, this.gemCd  - dt);

    if (beams > 0 && this.beamCd <= 0) { this.playBeam();        this.beamCd = 0.09; }
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

  // --- Private synthesis -------------------------------------------------

  private playBeam(): void {
    this.note(2200, 0, 0.04, 0.032, 1100);
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
