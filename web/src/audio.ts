// Procedural Crystalline Web Audio DSP Engine for Prism.
// 100% pure Web Audio synthesis (zero external assets, strict CSP compliant).
//
// Features:
//   - Modal glass-bell harmonic synthesis (1.0 / 2.756 / 5.404 inharmonic partials)
//   - D Lydian pentatonic pitch lattice so rapid gem cascades & refractions harmonize
//   - Stereo ping-pong glass cavern delay + DynamicsCompressor master bus
//   - Smooth low-pass modal filter ducking when level-up / pause overlays open
//   - Adaptive ambient/combat rhythmic pulse bed scaling with build intensity & boss encounters

const AUDIO_RANK_UP = 1 << 0;
const AUDIO_PLAYER_HIT = 1 << 1;
const AUDIO_BOSS_SPAWN = 1 << 2;
const AUDIO_BOSS_PHASE = 1 << 3;
const AUDIO_SHIELD_BREAK = 1 << 4;
const AUDIO_DASH_BLAST = 1 << 5;
const AUDIO_MINE_BURST = 1 << 6;
const AUDIO_STREAK_MILESTONE = 1 << 7;
const AUDIO_EVOLUTION = 1 << 8;

// D Lydian Pentatonic crystalline lattice (D4 → F#6): always luminous, never muddy.
const LYDIAN_SCALE = [
  293.66, 329.63, 369.99, 440.00, 493.88,
  587.33, 659.25, 739.99, 880.00, 987.77,
  1174.66, 1318.51, 1479.98,
];

// Ambient generative bass root cycle (D2, A1, B1, G1).
const BASS_CYCLE = [73.42, 55.00, 61.74, 49.00];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private duckFilter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  // Continuous shimmering refraction beam bed.
  private beamOsc1: OscillatorNode | null = null;
  private beamOsc2: OscillatorNode | null = null;
  private beamGain: GainNode | null = null;
  private beamFilter: BiquadFilterNode | null = null;

  // Adaptive ambient/combat crystal drone.
  private padOsc1: OscillatorNode | null = null;
  private padOsc2: OscillatorNode | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;

  private muted = false;
  private ducked = false;
  private prevSynergyBits = 0;

  // Musical state & voice rate-limiting.
  private gemStep = 0;
  private gemDecayTimer = 0;
  private gemCooldown = 0;
  private killCooldown = 0;
  private accentCooldown = 0;
  private pulseClock = 0;
  private pulseStep = 0;
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

    // Master dynamics compressor prevents clipping during late-game cascades.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.14;
    compressor.connect(ctx.destination);

    // Master gain + smooth low-pass modal ducking filter.
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.78;
    this.masterGain.connect(compressor);

    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = this.ducked ? 460 : 18500;
    this.duckFilter.Q.value = 0.7;
    this.duckFilter.connect(this.masterGain);

    // Primary dry SFX bus.
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.0;
    this.sfxBus.connect(this.duckFilter);

    // Parallel Stereo Ping-Pong Glass Cavern Delay (spacious crystal shimmer).
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.26;
    this.sfxBus.connect(delaySend);

    const delayL = ctx.createDelay(0.5);
    delayL.delayTime.value = 0.185;
    const delayR = ctx.createDelay(0.5);
    delayR.delayTime.value = 0.275;

    const filterL = ctx.createBiquadFilter();
    filterL.type = 'bandpass';
    filterL.frequency.value = 1750;
    filterL.Q.value = 0.65;

    const filterR = ctx.createBiquadFilter();
    filterR.type = 'bandpass';
    filterR.frequency.value = 2250;
    filterR.Q.value = 0.65;

    const fbL = ctx.createGain();
    fbL.gain.value = 0.30;
    const fbR = ctx.createGain();
    fbR.gain.value = 0.26;

    const panL = ctx.createStereoPanner();
    panL.pan.value = -0.72;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 0.72;

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

    // Pre-generate 0.5s white noise buffer for glass-shatter & phase-whoosh textures.
    const sampleCount = Math.floor(ctx.sampleRate * 0.5);
    const nbuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = nbuf.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = nbuf;

    // Continuous harmonic beam refraction bed (D3 + A3 perfect fifth).
    this.beamGain = ctx.createGain();
    this.beamGain.gain.value = 0.0001;
    this.beamFilter = ctx.createBiquadFilter();
    this.beamFilter.type = 'bandpass';
    this.beamFilter.frequency.value = 540;
    this.beamFilter.Q.value = 1.6;
    this.beamFilter.connect(this.beamGain);
    this.beamGain.connect(this.sfxBus);

    this.beamOsc1 = ctx.createOscillator();
    this.beamOsc1.type = 'triangle';
    this.beamOsc1.frequency.value = 146.83; // D3
    this.beamOsc1.connect(this.beamFilter);
    this.beamOsc1.start();

    this.beamOsc2 = ctx.createOscillator();
    this.beamOsc2.type = 'sine';
    this.beamOsc2.frequency.value = 220.0; // A3
    this.beamOsc2.connect(this.beamFilter);
    this.beamOsc2.start();

    // Adaptive ambient glass pad (subtle atmospheric bed).
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 420;
    this.padFilter.Q.value = 0.8;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.duckFilter);

    this.padOsc1 = ctx.createOscillator();
    this.padOsc1.type = 'sine';
    this.padOsc1.frequency.value = 73.42; // D2
    this.padOsc1.connect(this.padFilter);
    this.padOsc1.start();

    this.padOsc2 = ctx.createOscillator();
    this.padOsc2.type = 'triangle';
    this.padOsc2.frequency.value = 146.83 * 1.003; // gently detuned D3
    this.padOsc2.connect(this.padFilter);
    this.padOsc2.start();
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyDuckAndMute();
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public duck(pausedOrModal: boolean): void {
    this.ducked = pausedOrModal;
    this.applyDuckAndMute();
  }

  private applyDuckAndMute(): void {
    if (!this.ctx || !this.masterGain || !this.duckFilter) return;
    const now = this.ctx.currentTime;
    const targetGain = this.muted ? 0.0 : this.ducked ? 0.36 : 0.78;
    const targetCutoff = this.ducked ? 460 : 18500;
    this.masterGain.gain.setTargetAtTime(targetGain, now, 0.06);
    this.duckFilter.frequency.setTargetAtTime(targetCutoff, now, 0.08);
  }

  /** Modal glass-bell voice using physical crystalline bar overtone ratios (1.0, 2.756, 5.404). */
  private playGlassBell(
    freq: number,
    volume: number,
    decay: number,
    pan = 0,
    shimmer = true,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const now = ctx.currentTime;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    panner.connect(this.sfxBus);

    // Partial 1: Fundamental.
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

    // Partial 2: Glass modal overtone (2.756×).
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2.756, now);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(volume * 0.28, now + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.45);
    o2.connect(g2);
    g2.connect(panner);
    o2.start(now);
    o2.stop(now + decay * 0.48 + 0.02);

    // Partial 3: High crystalline glint (5.404×) on accents/chimes.
    if (shimmer && freq * 5.404 < 11000) {
      const o3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      o3.type = 'sine';
      o3.frequency.setValueAtTime(freq * 5.404, now);
      g3.gain.setValueAtTime(0.0001, now);
      g3.gain.linearRampToValueAtTime(volume * 0.10, now + 0.0015);
      g3.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.22);
      o3.connect(g3);
      g3.connect(panner);
      o3.start(now);
      o3.stop(now + decay * 0.25 + 0.02);
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
    if (!ctx || !this.sfxBus || !this.noiseBuf || this.muted) return;
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
    g.gain.linearRampToValueAtTime(volume, now + 0.006);
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
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Rate-limit timers.
    this.gemCooldown = Math.max(0, this.gemCooldown - dt);
    this.killCooldown = Math.max(0, this.killCooldown - dt);
    this.accentCooldown = Math.max(0, this.accentCooldown - dt);

    if (this.gemDecayTimer > 0) {
      this.gemDecayTimer -= dt;
      if (this.gemDecayTimer <= 0) this.gemStep = 0;
    }

    // 1. Continuous refraction beam shimmer bed.
    if (this.beamGain && this.beamFilter) {
      const targetGain =
        beamCount > 0 ? Math.min(0.095, 0.018 + Math.log1p(beamCount) * 0.026) : 0.0001;
      const targetFreq = 440 + Math.min(beamCount, 30) * 34 + intensity * 420;
      this.beamGain.gain.setTargetAtTime(targetGain, now, 0.06);
      this.beamFilter.frequency.setTargetAtTime(targetFreq, now, 0.07);
    }

    // 2. Adaptive ambient & rhythmic combat pulse bed.
    if (this.padGain && this.padFilter && this.padOsc1 && this.padOsc2) {
      const padTarget = this.muted ? 0.0001 : 0.032 + intensity * 0.026 + (bossActive ? 0.022 : 0);
      const padCutoff = 280 + intensity * 380 + (bossActive ? 340 : 0);
      this.padGain.gain.setTargetAtTime(padTarget, now, 0.25);
      this.padFilter.frequency.setTargetAtTime(padCutoff, now, 0.25);

      // Gentle generative crystalline pulse step every 0.45s (faster during boss/high intensity).
      const stepPeriod = bossActive ? 0.28 : Math.max(0.32, 0.56 - intensity * 0.20);
      this.pulseClock += dt;
      if (this.pulseClock >= stepPeriod) {
        this.pulseClock -= stepPeriod;
        this.pulseStep = (this.pulseStep + 1) % 16;
        const rootIdx = Math.floor(this.pulseStep / 4) % BASS_CYCLE.length;
        const rootHz = BASS_CYCLE[rootIdx]!;
        this.padOsc1.frequency.setTargetAtTime(rootHz, now, 0.08);
        this.padOsc2.frequency.setTargetAtTime(rootHz * (bossActive ? 1.5 : 2.004), now, 0.08);

        // Subtle rhythmic glass arpeggio ticks when combat escalates.
        if ((intensity > 0.15 || bossActive) && !this.ducked) {
          const noteIdx = (this.pulseStep * 2 + (bossActive ? 3 : 0)) % 8;
          const hz = LYDIAN_SCALE[noteIdx]! * (bossActive ? 0.5 : 1.0);
          this.playGlassBell(
            hz,
            0.014 + intensity * 0.012 + (bossActive ? 0.010 : 0),
            0.22,
            (this.pulseStep % 2 === 0 ? -0.45 : 0.45),
            false,
          );
        }
      }
    }

    // 3. Delicate crystalline beam accent.
    if (beamCount > 0 && this.accentCooldown <= 0) {
      this.accentCooldown = 0.22;
      const idx = (beamCount + this.pulseStep) % 7;
      this.panToggle = -this.panToggle;
      this.playGlassBell(LYDIAN_SCALE[idx + 2]!, 0.024, 0.16, this.panToggle * 0.35, false);
    }

    // 4. Radiance gem pickup ascending Lydian glass cascade!
    if (gemCount > 0 && this.gemCooldown <= 0) {
      this.gemCooldown = 0.045;
      this.gemDecayTimer = 0.65;
      const note = LYDIAN_SCALE[Math.min(this.gemStep, LYDIAN_SCALE.length - 1)]!;
      this.gemStep = Math.min(this.gemStep + 1, LYDIAN_SCALE.length - 1);
      this.panToggle = -this.panToggle;
      this.playGlassBell(note, 0.075, 0.28, this.panToggle * 0.42, true);
    }

    // 5. Enemy shatter transient + sub-punch.
    if (killCount > 0 && this.killCooldown <= 0) {
      this.killCooldown = 0.055;
      this.playKillShatter(killCount, killStreak);
    }

    // 6. Discrete combat & milestone events.
    if (eventBits & AUDIO_DASH_BLAST) this.playDashWhoosh();
    if (eventBits & AUDIO_MINE_BURST) this.playMineBurst();
    if (eventBits & AUDIO_PLAYER_HIT) this.playPlayerHit();
    if (eventBits & AUDIO_SHIELD_BREAK) this.playShieldBreak();
    if (eventBits & AUDIO_BOSS_PHASE) this.playBossPhase();
    if (eventBits & AUDIO_BOSS_SPAWN) this.playBossSpawn();
    if (eventBits & AUDIO_STREAK_MILESTONE) this.playStreakMilestone(killStreak);
    if (eventBits & AUDIO_EVOLUTION) this.playEvolutionFanfare();
    if (eventBits & AUDIO_RANK_UP) this.playRankUp();

    // Newly unlocked synergy chime!
    if ((synergyBits & ~this.prevSynergyBits) !== 0) {
      this.playSynergyUnlock();
    }
    this.prevSynergyBits = synergyBits;
  }

  private playKillShatter(count: number, streak: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const now = ctx.currentTime;

    // Punchy low sub-thump for tactile weight.
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    const baseSub = 112 + Math.min(streak, 60) * 0.6;
    sub.frequency.setValueAtTime(baseSub, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.085);
    sg.gain.setValueAtTime(0.085, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.10);

    // Crisp crystalline shard ping + bright sparkle noise.
    const noteIdx = (4 + (streak % 7)) % LYDIAN_SCALE.length;
    this.playGlassBell(LYDIAN_SCALE[noteIdx]!, Math.min(0.06, 0.032 + count * 0.006), 0.14, (Math.random() - 0.5) * 0.6, false);
    this.playFilteredNoise('highpass', 3600, 7200, 1.4, 0.035, 0.055);
  }

  private playDashWhoosh(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    this.playFilteredNoise('bandpass', 650, 3200, 2.2, 0.16, 0.18);
    this.playGlassBell(587.33, 0.07, 0.24, -0.3, true);
    this.playGlassBell(880.00, 0.05, 0.22, 0.3, true);
  }

  private playMineBurst(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.24);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.27);
    this.playFilteredNoise('bandpass', 1400, 380, 1.2, 0.09, 0.16);
  }

  private playPlayerHit(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.22);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    g.gain.setValueAtTime(0.20, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.25);
    this.playFilteredNoise('lowpass', 1200, 220, 0.9, 0.14, 0.14);
  }

  private playShieldBreak(): void {
    this.playFilteredNoise('highpass', 2400, 9000, 1.8, 0.18, 0.28);
    [739.99, 987.77, 1318.51, 1479.98].forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.10, 0.55, (i - 1.5) * 0.4, true), i * 38);
    });
  }

  private playBossSpawn(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const now = ctx.currentTime;
    // Deep ominous sub-drop + resonant horn swell.
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
    g.gain.linearRampToValueAtTime(0.24, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 1.3);

    this.playGlassBell(293.66, 0.11, 1.1, -0.5, true);
    setTimeout(() => this.playGlassBell(220.0, 0.10, 1.0, 0.5, true), 140);
  }

  private playBossPhase(): void {
    [440.0, 587.33, 739.99].forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.095, 0.45, (i - 1) * 0.5, true), i * 65);
    });
  }

  private playStreakMilestone(streak: number): void {
    const base = streak >= 100 ? 7 : streak >= 50 ? 5 : 3;
    [0, 2, 4].forEach((off, i) => {
      const hz = LYDIAN_SCALE[Math.min(base + off, LYDIAN_SCALE.length - 1)]!;
      setTimeout(() => this.playGlassBell(hz, 0.085, 0.42, (i - 1) * 0.45, true), i * 48);
    });
  }

  private playRankUp(): void {
    const chord = [440.0, 587.33, 739.99, 880.0];
    chord.forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.095, 0.62, (i - 1.5) * 0.38, true), i * 58);
    });
  }

  private playSynergyUnlock(): void {
    const chord = [587.33, 739.99, 880.0, 1174.66, 1318.51];
    chord.forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.105, 0.78, (i - 2) * 0.35, true), i * 52);
    });
  }

  private playEvolutionFanfare(): void {
    const chord = [293.66, 440.0, 587.33, 739.99, 987.77, 1174.66, 1479.98];
    chord.forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.115, 1.05, (i - 3) * 0.26, true), i * 62);
    });
  }

  public playUiHover(): void {
    this.playGlassBell(880.0, 0.025, 0.10, 0, false);
  }

  public playUiSelect(): void {
    this.playGlassBell(587.33, 0.065, 0.24, -0.2, true);
    setTimeout(() => this.playGlassBell(880.0, 0.065, 0.30, 0.2, true), 45);
  }

  public playVictory(): void {
    const fanfare = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66];
    fanfare.forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.12, 1.4, (i - 3) * 0.25, true), i * 95);
    });
  }

  public playDeath(): void {
    const fall = [440.0, 369.99, 293.66, 220.0];
    fall.forEach((hz, i) => {
      setTimeout(() => this.playGlassBell(hz, 0.10, 0.9, (i - 1.5) * 0.3, false), i * 135);
    });
  }
}
