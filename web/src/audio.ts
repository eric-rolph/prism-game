// Unified Procedural Audio & Harmonic Soundtrack Controller for Prism.
// Pairs the multi-section classic/modern MusicEngine with harmonically-locked crystalline SFX:
//   - Gem pickups, Aim-Trainer flick hits, and Supernova detonations pull consonant pitches directly
//     from the currently sounding chord in MusicEngine (Rez Infinite / Lumines harmonic cohesion!).
//   - Continuous pitch-rising resonant lock-on shimmer during Smooth Tracking drills.
//   - Separate Music & SFX toggles + master dynamics compressor + smooth low-pass modal ducking.

import { MusicEngine } from './music.js';

const AUDIO_RANK_UP = 1 << 0;
const AUDIO_PLAYER_HIT = 1 << 1;
const AUDIO_BOSS_SPAWN = 1 << 2;
const AUDIO_BOSS_PHASE = 1 << 3;
const AUDIO_SHIELD_BREAK = 1 << 4;
const AUDIO_DASH_BLAST = 1 << 5;
const AUDIO_MINE_BURST = 1 << 6;
const AUDIO_STREAK_MILESTONE = 1 << 7;
const AUDIO_EVOLUTION = 1 << 8;
const AUDIO_AIM_HIT = 1 << 9;
const AUDIO_AIM_COMPLETE = 1 << 10;
const AUDIO_AIM_MISS = 1 << 11;
const AUDIO_GHOST_LOCK = 1 << 12;
const AUDIO_GHOST_SHOT = 1 << 13;
const AUDIO_DEADEYE_START = 1 << 14;
const AUDIO_DEADEYE_VOLLEY = 1 << 15;
const AUDIO_OBELISK_CAPTURE = 1 << 16;
const AUDIO_WEAKPOINT_CRIT = 1 << 17;
const AUDIO_SURGE_TIER_UP = 1 << 18;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private duckFilter: BiquadFilterNode | null = null;
  private sfxMasterGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private music: MusicEngine | null = null;

  // Continuous shimmering refraction beam bed.
  private beamOsc1: OscillatorNode | null = null;
  private beamOsc2: OscillatorNode | null = null;
  private beamGain: GainNode | null = null;
  private beamFilter: BiquadFilterNode | null = null;

  // Continuous pitch-rising harmonic lock-on beam during Smooth Tracking drills!
  private trackOsc1: OscillatorNode | null = null;
  private trackOsc2: OscillatorNode | null = null;
  private trackGain: GainNode | null = null;

  private sfxMuted = false;
  private musicMuted = false;
  private ducked = false;
  private prevSynergyBits = 0;

  private gemStep = 0;
  private gemDecayTimer = 0;
  private gemCooldown = 0;
  private killCooldown = 0;
  private accentCooldown = 0;
  private panToggle = 1;

  public isInitialized(): boolean {
    return this.ctx !== null;
  }

  public init(): void {
    if (this.ctx) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Master dynamics compressor keeps dense soundtrack + cascades punchy and clip-free.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -13;
    compressor.knee.value = 12;
    compressor.ratio.value = 5.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.14;
    compressor.connect(ctx.destination);

    // Pre-generate 0.6s noise buffer shared by SFX & electronic drums.
    const sampleCount = Math.floor(ctx.sampleRate * 0.6);
    const nbuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = nbuf.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = nbuf;

    // Multi-section adaptive soundtrack engine!
    this.music = new MusicEngine(ctx, compressor, nbuf);
    this.music.setMuted(this.musicMuted);
    this.music.setDucked(this.ducked);
    this.music.start();

    // SFX master bus + modal low-pass ducking.
    this.sfxMasterGain = ctx.createGain();
    this.sfxMasterGain.gain.value = this.sfxMuted ? 0 : 0.72;
    this.sfxMasterGain.connect(compressor);

    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = this.ducked ? 500 : 18500;
    this.duckFilter.Q.value = 0.7;
    this.duckFilter.connect(this.sfxMasterGain);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.0;
    this.sfxBus.connect(this.duckFilter);

    // Stereo ping-pong glass cavern delay for SFX sparkles.
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.22;
    this.sfxBus.connect(delaySend);

    const delayL = ctx.createDelay(0.5);
    delayL.delayTime.value = 0.18;
    const delayR = ctx.createDelay(0.5);
    delayR.delayTime.value = 0.27;

    const filterL = ctx.createBiquadFilter();
    filterL.type = 'bandpass';
    filterL.frequency.value = 1850;
    filterL.Q.value = 0.7;
    const filterR = ctx.createBiquadFilter();
    filterR.type = 'bandpass';
    filterR.frequency.value = 2350;
    filterR.Q.value = 0.7;

    const fbL = ctx.createGain();
    fbL.gain.value = 0.26;
    const fbR = ctx.createGain();
    fbR.gain.value = 0.22;

    const panL = ctx.createStereoPanner();
    panL.pan.value = -0.68;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 0.68;

    delaySend.connect(delayL);
    delayL.connect(filterL);
    filterL.connect(panL);
    panL.connect(this.duckFilter);

    filterL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(filterR);
    filterR.connect(panR);
    panR.connect(this.duckFilter);
    filterR.connect(fbR);
    fbR.connect(delayL);

    // Subtle refraction beam bed.
    this.beamGain = ctx.createGain();
    this.beamGain.gain.value = 0.0001;
    this.beamFilter = ctx.createBiquadFilter();
    this.beamFilter.type = 'bandpass';
    this.beamFilter.frequency.value = 620;
    this.beamFilter.Q.value = 1.8;
    this.beamFilter.connect(this.beamGain);
    this.beamGain.connect(this.sfxBus);

    this.beamOsc1 = ctx.createOscillator();
    this.beamOsc1.type = 'triangle';
    this.beamOsc1.frequency.value = 146.83;
    this.beamOsc1.connect(this.beamFilter);
    this.beamOsc1.start();

    this.beamOsc2 = ctx.createOscillator();
    this.beamOsc2.type = 'sine';
    this.beamOsc2.frequency.value = 220.0;
    this.beamOsc2.connect(this.beamFilter);
    this.beamOsc2.start();

    // Smooth Tracking resonant lock-on harmonic beam (rises in pitch as charge fills 0→100%!).
    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = 0.0001;
    this.trackGain.connect(this.sfxBus);

    this.trackOsc1 = ctx.createOscillator();
    this.trackOsc1.type = 'sine';
    this.trackOsc1.frequency.value = 330;
    this.trackOsc1.connect(this.trackGain);
    this.trackOsc1.start();

    this.trackOsc2 = ctx.createOscillator();
    this.trackOsc2.type = 'triangle';
    this.trackOsc2.frequency.value = 495;
    const t2g = ctx.createGain();
    t2g.gain.value = 0.35;
    this.trackOsc2.connect(t2g);
    t2g.connect(this.trackGain);
    this.trackOsc2.start();
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public toggleSfx(): boolean {
    this.sfxMuted = !this.sfxMuted;
    this.applySfxBus();
    return this.sfxMuted;
  }

  public isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  public toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    this.music?.setMuted(this.musicMuted);
    return this.musicMuted;
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  public getNowPlaying(): string {
    return this.music ? this.music.getNowPlaying() : 'CRYSTAL OVERTURE';
  }

  public duck(pausedOrModal: boolean): void {
    this.ducked = pausedOrModal;
    this.applySfxBus();
    this.music?.setDucked(pausedOrModal);
  }

  public updateMusicState(isTitle: boolean, energy: number, bossActive: boolean): void {
    this.music?.setGameState(isTitle, energy, bossActive);
  }

  private applySfxBus(): void {
    if (!this.ctx || !this.sfxMasterGain || !this.duckFilter) return;
    const now = this.ctx.currentTime;
    const targetGain = this.sfxMuted ? 0.0 : this.ducked ? 0.32 : 0.72;
    const targetCutoff = this.ducked ? 500 : 18500;
    this.sfxMasterGain.gain.setTargetAtTime(targetGain, now, 0.06);
    this.duckFilter.frequency.setTargetAtTime(targetCutoff, now, 0.08);
  }

  private harmonicNote(stepIndex: number): number {
    const scale = this.music?.getActiveScaleFreqs() ?? [587.33, 659.25, 739.99, 880, 987.77, 1174.66];
    const idx = Math.max(0, Math.min(scale.length - 1, stepIndex));
    return scale[idx]!;
  }

  /** Modal glass-bell voice (physical crystalline bar overtone ratios 1.0 / 2.756 / 5.404). */
  private playGlassBell(
    freq: number,
    volume: number,
    decay: number,
    pan = 0,
    shimmer = true,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    panner.connect(this.sfxBus);

    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(freq, now);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.linearRampToValueAtTime(volume, now + 0.004);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    o1.connect(g1);
    g1.connect(panner);
    o1.start(now);
    o1.stop(now + decay + 0.02);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2.756, now);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(volume * 0.26, now + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.42);
    o2.connect(g2);
    g2.connect(panner);
    o2.start(now);
    o2.stop(now + decay * 0.45 + 0.02);

    if (shimmer && freq * 5.404 < 11000) {
      const o3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      o3.type = 'sine';
      o3.frequency.setValueAtTime(freq * 5.404, now);
      g3.gain.setValueAtTime(0.0001, now);
      g3.gain.linearRampToValueAtTime(volume * 0.09, now + 0.0015);
      g3.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.20);
      o3.connect(g3);
      g3.connect(panner);
      o3.start(now);
      o3.stop(now + decay * 0.22 + 0.02);
    }
  }

  private playFilteredNoise(
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    volume: number,
    duration: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuf || this.sfxMuted) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;

    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(freqStart, now);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxBus);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  public tick(
    dt: number,
    beamCount: number,
    killCount: number,
    gemCount: number,
    eventBits: number,
    synergyBits: number,
    intensity = 0,
    bossActive = false,
    killStreak = 0,
    aimTracking = false,
    aimTrackProgress = 0,
    aimCombo = 0,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const musicalEnergy = Math.min(
      1,
      0.12 + intensity * 0.65 + Math.min(killStreak, 40) * 0.006 + Math.min(aimCombo, 10) * 0.02,
    );
    this.music?.setGameState(false, musicalEnergy, bossActive);

    this.gemCooldown = Math.max(0, this.gemCooldown - dt);
    this.killCooldown = Math.max(0, this.killCooldown - dt);
    this.accentCooldown = Math.max(0, this.accentCooldown - dt);
    if (this.gemDecayTimer > 0) {
      this.gemDecayTimer -= dt;
      if (this.gemDecayTimer <= 0) this.gemStep = 0;
    }

    // 1. Subtle beam refraction hum.
    if (this.beamGain && this.beamFilter) {
      const targetGain =
        beamCount > 0 && !this.sfxMuted
          ? Math.min(0.055, 0.012 + Math.log1p(beamCount) * 0.015)
          : 0.0001;
      const targetFreq = 480 + Math.min(beamCount, 28) * 30 + intensity * 380;
      this.beamGain.gain.setTargetAtTime(targetGain, now, 0.06);
      this.beamFilter.frequency.setTargetAtTime(targetFreq, now, 0.07);
    }

    // 2. Smooth Tracking resonant lock-on shimmer (rises smoothly an octave as track hits 100%!).
    if (this.trackGain && this.trackOsc1 && this.trackOsc2) {
      const active = aimTracking && !this.sfxMuted;
      this.trackGain.gain.setTargetAtTime(active ? 0.065 + aimTrackProgress * 0.055 : 0.0001, now, 0.035);
      if (active) {
        const baseHz = 293.66 * Math.pow(2, aimTrackProgress * 1.15);
        this.trackOsc1.frequency.setTargetAtTime(baseHz, now, 0.03);
        this.trackOsc2.frequency.setTargetAtTime(baseHz * 1.5, now, 0.03);
      }
    }

    // 3. Harmonically-locked beam shimmer accent.
    if (beamCount > 0 && this.accentCooldown <= 0) {
      this.accentCooldown = 0.28;
      this.panToggle = -this.panToggle;
      this.playGlassBell(this.harmonicNote(3 + (beamCount % 6)), 0.018, 0.14, this.panToggle * 0.35, false);
    }

    // 4. Radiance gem pickup ascending harmonic cascade (locked to live soundtrack chord!).
    if (gemCount > 0 && this.gemCooldown <= 0) {
      this.gemCooldown = 0.048;
      this.gemDecayTimer = 0.70;
      const hz = this.harmonicNote(2 + this.gemStep);
      this.gemStep = Math.min(this.gemStep + 1, 12);
      this.panToggle = -this.panToggle;
      this.playGlassBell(hz, 0.068, 0.26, this.panToggle * 0.42, true);
    }

    // 5. Enemy shatter.
    if (killCount > 0 && this.killCooldown <= 0) {
      this.killCooldown = 0.06;
      this.playKillShatter(killCount, killStreak);
    }

    // 6. FPS Aim-Trainer & Ghost Sniper precision audio feedback!
    if (eventBits & AUDIO_AIM_HIT) this.playAimHit(aimCombo);
    if (eventBits & AUDIO_AIM_COMPLETE) this.playAimDrillComplete();
    if (eventBits & AUDIO_AIM_MISS) this.playAimMiss();
    if (eventBits & AUDIO_GHOST_LOCK) this.playGhostLock();
    if (eventBits & AUDIO_GHOST_SHOT) this.playGhostShot();
    if (eventBits & AUDIO_DEADEYE_START) this.playDeadeyeStart();
    if (eventBits & AUDIO_DEADEYE_VOLLEY) this.playDeadeyeVolley();
    if (eventBits & AUDIO_OBELISK_CAPTURE) this.playObeliskCapture();
    if (eventBits & AUDIO_WEAKPOINT_CRIT) this.playWeakpointCrit(aimCombo);
    if (eventBits & AUDIO_SURGE_TIER_UP) this.playSurgeTierUp(aimCombo);

    // 7. Combat & milestone SFX.
    if (eventBits & AUDIO_DASH_BLAST) this.playDashWhoosh();
    if (eventBits & AUDIO_MINE_BURST) this.playMineBurst();
    if (eventBits & AUDIO_PLAYER_HIT) this.playPlayerHit();
    if (eventBits & AUDIO_SHIELD_BREAK) this.playShieldBreak();
    if (eventBits & AUDIO_BOSS_PHASE) this.playBossPhase();
    if (eventBits & AUDIO_BOSS_SPAWN) this.playBossSpawn();
    if (eventBits & AUDIO_STREAK_MILESTONE) this.playStreakMilestone(killStreak);
    if (eventBits & AUDIO_EVOLUTION) this.playEvolutionFanfare();
    if (eventBits & AUDIO_RANK_UP) this.playRankUp();

    if ((synergyBits & ~this.prevSynergyBits) !== 0) {
      this.playSynergyUnlock();
    }
    this.prevSynergyBits = synergyBits;
  }

  /** Crisp KovaaK's / Valorant-inspired crystalline headshot-snap tuned to the active chord! */
  private playAimHit(combo: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const note = this.harmonicNote(5 + (combo % 8));

    // Ultra-crisp tactile transient click + harmonic bell ring.
    this.playGlassBell(note, 0.115, 0.24, (Math.random() - 0.5) * 0.35, true);
    this.playGlassBell(note * 1.5, 0.055, 0.16, 0, true);

    // Subtle crisp laser snap transient.
    const snap = ctx.createOscillator();
    const sg = ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(1600, now);
    snap.frequency.exponentialRampToValueAtTime(280, now + 0.045);
    sg.gain.setValueAtTime(0.09, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    snap.connect(sg);
    sg.connect(this.sfxBus);
    snap.start(now);
    snap.stop(now + 0.055);
  }

  /** Euphoric chord burst when completing Flick Chain / Smooth Track / Micro-Cluster! */
  private playAimDrillComplete(): void {
    this.playFilteredNoise('bandpass', 1800, 5200, 1.4, 0.12, 0.22);
    [4, 6, 8, 10, 12].forEach((deg, i) => {
      setTimeout(() => {
        this.playGlassBell(this.harmonicNote(deg), 0.105, 0.65, (i - 2) * 0.32, true);
      }, i * 38);
    });
  }

  private playAimMiss(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(115, now + 0.075);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  /** Distinct crystalline radar lock chirp when a hostile Pink Ghost Sniper spawns or locks on! */
  private playGhostLock(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    [0, 0.075].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const base = idx === 0 ? 1180 : 1560;
      osc.frequency.setValueAtTime(base, now + offset);
      osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + offset + 0.055);
      g.gain.setValueAtTime(0.08, now + offset);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.065);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  /** Sharp high-velocity sniper crack when an un-countered Ghost Player gets a shot off! */
  private playGhostShot(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.16);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.19);
    this.playFilteredNoise('bandpass', 2800, 620, 1.5, 0.14, 0.12);
  }

  /** Iconic time-dilation bass dive + shimmering crystal veil entering Prismatic Dead-Eye! */
  private playDeadeyeStart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(290, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.42);
    sg.gain.setValueAtTime(0.24, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.5);

    this.playFilteredNoise('lowpass', 3600, 260, 1.2, 0.13, 0.36);
    this.playGlassBell(this.harmonicNote(10), 0.10, 0.9, -0.4, true);
    this.playGlassBell(this.harmonicNote(12), 0.09, 0.9, 0.4, true);
  }

  /** Cascading golden orbital rail volley when Dead-Eye releases all painted locks! */
  private playDeadeyeVolley(): void {
    this.playFilteredNoise('bandpass', 1400, 7400, 1.8, 0.16, 0.28);
    [5, 7, 9, 11, 13, 15].forEach((deg, i) => {
      setTimeout(() => {
        this.playGlassBell(this.harmonicNote(deg), 0.12, 0.52, (i - 2.5) * 0.26, true);
      }, i * 34);
    });
  }

  /** Triumphant rising harmonic beacon chime upon capturing a Golden Prism Obelisk! */
  private playObeliskCapture(): void {
    this.playFilteredNoise('highpass', 2200, 8200, 1.2, 0.11, 0.24);
    [3, 5, 7, 10, 12, 14].forEach((deg, i) => {
      setTimeout(() => {
        this.playGlassBell(this.harmonicNote(deg), 0.105, 0.85, (i - 2.5) * 0.28, true);
      }, i * 52);
    });
  }

  /** Hyper-crisp diamond weakpoint shatter for Boss Weakpoints / Lattice Relays / Reflector Rear! */
  private playWeakpointCrit(combo: number): void {
    const note = this.harmonicNote(8 + (combo % 6));
    this.playGlassBell(note, 0.125, 0.34, -0.25, true);
    this.playGlassBell(note * 1.5, 0.09, 0.26, 0.25, true);
    this.playFilteredNoise('highpass', 3600, 9600, 2.0, 0.08, 0.09);
  }

  /** Rising resonant harmonic swell when Resonance Surge Power-Up ignites or climbs tiers! */
  private playSurgeTierUp(combo: number): void {
    const base = 5 + Math.min(6, Math.floor(combo / 2));
    [0, 2, 4, 7].forEach((off, i) => {
      setTimeout(() => {
        this.playGlassBell(this.harmonicNote(base + off), 0.095, 0.42, (i - 1.5) * 0.28, true);
      }, i * 32);
    });
    this.playFilteredNoise('bandpass', 1200, 5600, 1.4, 0.075, 0.16);
  }

  private playKillShatter(count: number, streak: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(108 + Math.min(streak, 60) * 0.5, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.08);
    sg.gain.setValueAtTime(0.07, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.095);

    this.playGlassBell(
      this.harmonicNote(4 + (streak % 7)),
      Math.min(0.052, 0.026 + count * 0.005),
      0.13,
      (Math.random() - 0.5) * 0.55,
      false,
    );
    this.playFilteredNoise('highpass', 3800, 7600, 1.4, 0.028, 0.05);
  }

  private playDashWhoosh(): void {
    this.playFilteredNoise('bandpass', 620, 3400, 2.0, 0.15, 0.17);
    this.playGlassBell(this.harmonicNote(5), 0.06, 0.22, -0.3, true);
    this.playGlassBell(this.harmonicNote(8), 0.05, 0.20, 0.3, true);
  }

  private playMineBurst(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.22);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.25);
    this.playFilteredNoise('bandpass', 1400, 380, 1.2, 0.08, 0.15);
  }

  private playPlayerHit(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.22);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(880, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    g.gain.setValueAtTime(0.19, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.25);
    this.playFilteredNoise('lowpass', 1100, 220, 0.9, 0.12, 0.13);
  }

  private playShieldBreak(): void {
    this.playFilteredNoise('highpass', 2400, 9200, 1.8, 0.16, 0.26);
    [6, 8, 10, 12].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.10, 0.52, (i - 1.5) * 0.4, true), i * 38);
    });
  }

  private playBossSpawn(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.sfxMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(36.7, now + 1.15);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + 1.15);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 1.3);
  }

  private playBossPhase(): void {
    [4, 6, 9].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.09, 0.44, (i - 1) * 0.5, true), i * 62);
    });
  }

  private playStreakMilestone(streak: number): void {
    const base = streak >= 100 ? 7 : streak >= 50 ? 5 : 3;
    [0, 2, 4].forEach((off, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(base + off), 0.085, 0.42, (i - 1) * 0.45, true), i * 48);
    });
  }

  private playRankUp(): void {
    [3, 5, 7, 10].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.095, 0.62, (i - 1.5) * 0.38, true), i * 55);
    });
  }

  private playSynergyUnlock(): void {
    [5, 7, 9, 11, 13].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.10, 0.78, (i - 2) * 0.35, true), i * 50);
    });
  }

  private playEvolutionFanfare(): void {
    [2, 4, 6, 8, 10, 12, 14].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.11, 1.0, (i - 3) * 0.25, true), i * 60);
    });
  }

  public playUiHover(): void {
    this.playGlassBell(this.harmonicNote(8), 0.022, 0.09, 0, false);
  }

  public playUiSelect(): void {
    this.playGlassBell(this.harmonicNote(5), 0.06, 0.22, -0.2, true);
    setTimeout(() => this.playGlassBell(this.harmonicNote(9), 0.06, 0.28, 0.2, true), 45);
  }

  public playVictory(): void {
    [2, 4, 6, 8, 10, 12, 14].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.11, 1.35, (i - 3) * 0.25, true), i * 90);
    });
  }

  public playDeath(): void {
    [7, 5, 3, 1].forEach((deg, i) => {
      setTimeout(() => this.playGlassBell(this.harmonicNote(deg), 0.095, 0.85, (i - 1.5) * 0.3, false), i * 130);
    });
  }
}
