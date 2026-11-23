// WebGL2 SOTA Optical Renderer for Prism:
//   Pass 1: Spherical sapphire crystal globe + starfield + caustics → HDR FBO
//   Pass 2: Instanced SDF faceted geometry + optical plasma beams → HDR FBO (additive)
//   Pass 3: 4-level Dual Kawase Bloom Pyramid (1/2 → 1/4 → 1/8 → 1/16 → 1/8 → 1/4 → 1/2)
//   Pass 4: ACES Filmic tone-mapped composite + temporal persistence + combat flashes → screen
//   Pass 5: Snapshot HDR scene to persistence ping-pong FBO
//
// Includes full WebGL context-loss & automatic restoration recovery, plus
// configurable visual FX intensity ('high' | 'balanced' | 'reduced').

import {
  BEAM_FRAG,
  BEAM_VERT,
  BLOOM_PREFILTER_FRAG,
  CIRCLE_FRAG,
  CIRCLE_VERT,
  COMPOSITE_FRAG,
  COPY_FRAG,
  FULLSCREEN_VERT,
  GRID_FRAG,
  GRID_VERT,
  KAWASE_DOWN_FRAG,
  KAWASE_UP_FRAG,
} from './shaders.js';

const CIRCLE_STRIDE_FLOATS = 9;
const BEAM_STRIDE_FLOATS = 11;
const CIRCLE_STRIDE = CIRCLE_STRIDE_FLOATS * 4;
const BEAM_STRIDE = BEAM_STRIDE_FLOATS * 4;

const BLOOM_LEVELS = 4;
// Per-octave upsample weights from coarsest (1/16) up to finest (1/2).
const BLOOM_UP_WEIGHTS = [0.65, 0.72, 0.78, 0.85];

export type VisualQuality = 'high' | 'balanced' | 'reduced';

interface FBO {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export interface RenderFxParams {
  intensity: number;
  screenFlash: number;
  damageFlash: number;
  lowHp: number;
  bossMood: number;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private halfFloat = false;
  private contextLost = false;
  private quality: VisualQuality = 'high';

  private gridProg!: WebGLProgram;
  private circleProg!: WebGLProgram;
  private beamProg!: WebGLProgram;
  private prefilterProg!: WebGLProgram;
  private kawaseDownProg!: WebGLProgram;
  private kawaseUpProg!: WebGLProgram;
  private compositeProg!: WebGLProgram;
  private copyProg!: WebGLProgram;

  private gridVao!: WebGLVertexArrayObject;
  private circleVao!: WebGLVertexArrayObject;
  private beamVao!: WebGLVertexArrayObject;
  private fsVao!: WebGLVertexArrayObject;

  private circleInstanceBuf!: WebGLBuffer;
  private beamInstanceBuf!: WebGLBuffer;

  private sceneFbo: FBO | null = null;
  private persistFbo: FBO | null = null;
  private bloomDownFbos: (FBO | null)[] = new Array(BLOOM_LEVELS).fill(null);
  private bloomUpFbos: (FBO | null)[] = new Array(BLOOM_LEVELS).fill(null);
  private fboW = 0;
  private fboH = 0;

  // Cached uniform locations.
  private uGridRes!: WebGLUniformLocation | null;
  private uGridCam!: WebGLUniformLocation | null;
  private uGridShake!: WebGLUniformLocation | null;
  private uGridRadius!: WebGLUniformLocation | null;
  private uGridTime!: WebGLUniformLocation | null;
  private uGridIntensity!: WebGLUniformLocation | null;
  private uGridBossMood!: WebGLUniformLocation | null;

  private uCircleRes!: WebGLUniformLocation | null;
  private uCircleCam!: WebGLUniformLocation | null;
  private uCircleShake!: WebGLUniformLocation | null;
  private uCircleRadius!: WebGLUniformLocation | null;
  private uCircleTime!: WebGLUniformLocation | null;

  private uBeamRes!: WebGLUniformLocation | null;
  private uBeamCam!: WebGLUniformLocation | null;
  private uBeamShake!: WebGLUniformLocation | null;
  private uBeamRadius!: WebGLUniformLocation | null;
  private uBeamTime!: WebGLUniformLocation | null;
  private uBeamDensity!: WebGLUniformLocation | null;

  private uPreTex!: WebGLUniformLocation | null;
  private uPreTexel!: WebGLUniformLocation | null;

  private uDownTex!: WebGLUniformLocation | null;
  private uDownTexel!: WebGLUniformLocation | null;

  private uUpTex!: WebGLUniformLocation | null;
  private uUpTexel!: WebGLUniformLocation | null;
  private uUpWeight!: WebGLUniformLocation | null;

  private uCompScene!: WebGLUniformLocation | null;
  private uCompBloom!: WebGLUniformLocation | null;
  private uCompPrev!: WebGLUniformLocation | null;
  private uCompTime!: WebGLUniformLocation | null;
  private uCompIntensity!: WebGLUniformLocation | null;
  private uCompBloomScale!: WebGLUniformLocation | null;
  private uCompScreenFlash!: WebGLUniformLocation | null;
  private uCompDamageFlash!: WebGLUniformLocation | null;
  private uCompLowHp!: WebGLUniformLocation | null;

  private uCopyTex!: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL2 is required — please use a modern browser.');
    }
    this.gl = gl;

    // WebGL context loss / restore resilience.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.fboW = 0;
      this.fboH = 0;
      this.sceneFbo = null;
      this.persistFbo = null;
      this.bloomDownFbos.fill(null);
      this.bloomUpFbos.fill(null);
      this.initResources();
      this.contextLost = false;
    });

    this.initResources();
  }

  public setQuality(q: VisualQuality): void {
    this.quality = q;
  }

  public getQuality(): VisualQuality {
    return this.quality;
  }

  private bloomScale(): number {
    if (this.quality === 'reduced') return 0.42;
    if (this.quality === 'balanced') return 0.72;
    return 1.0;
  }

  private initResources(): void {
    const gl = this.gl;
    this.halfFloat = gl.getExtension('EXT_color_buffer_float') !== null;

    this.gridProg = this.buildProgram(GRID_VERT, GRID_FRAG);
    this.circleProg = this.buildProgram(CIRCLE_VERT, CIRCLE_FRAG);
    this.beamProg = this.buildProgram(BEAM_VERT, BEAM_FRAG);
    this.prefilterProg = this.buildProgram(FULLSCREEN_VERT, BLOOM_PREFILTER_FRAG);
    this.kawaseDownProg = this.buildProgram(FULLSCREEN_VERT, KAWASE_DOWN_FRAG);
    this.kawaseUpProg = this.buildProgram(FULLSCREEN_VERT, KAWASE_UP_FRAG);
    this.compositeProg = this.buildProgram(FULLSCREEN_VERT, COMPOSITE_FRAG);
    this.copyProg = this.buildProgram(FULLSCREEN_VERT, COPY_FRAG);

    // Uniform lookups.
    this.uGridRes = gl.getUniformLocation(this.gridProg, 'u_resolution');
    this.uGridCam = gl.getUniformLocation(this.gridProg, 'u_camera');
    this.uGridShake = gl.getUniformLocation(this.gridProg, 'u_shake');
    this.uGridRadius = gl.getUniformLocation(this.gridProg, 'u_arena_radius');
    this.uGridTime = gl.getUniformLocation(this.gridProg, 'u_time');
    this.uGridIntensity = gl.getUniformLocation(this.gridProg, 'u_intensity');
    this.uGridBossMood = gl.getUniformLocation(this.gridProg, 'u_boss_mood');

    this.uCircleRes = gl.getUniformLocation(this.circleProg, 'u_resolution');
    this.uCircleCam = gl.getUniformLocation(this.circleProg, 'u_camera');
    this.uCircleShake = gl.getUniformLocation(this.circleProg, 'u_shake');
    this.uCircleRadius = gl.getUniformLocation(this.circleProg, 'u_arena_radius');
    this.uCircleTime = gl.getUniformLocation(this.circleProg, 'u_time');

    this.uBeamRes = gl.getUniformLocation(this.beamProg, 'u_resolution');
    this.uBeamCam = gl.getUniformLocation(this.beamProg, 'u_camera');
    this.uBeamShake = gl.getUniformLocation(this.beamProg, 'u_shake');
    this.uBeamRadius = gl.getUniformLocation(this.beamProg, 'u_arena_radius');
    this.uBeamTime = gl.getUniformLocation(this.beamProg, 'u_time');
    this.uBeamDensity = gl.getUniformLocation(this.beamProg, 'u_beam_density');

    this.uPreTex = gl.getUniformLocation(this.prefilterProg, 'u_tex');
    this.uPreTexel = gl.getUniformLocation(this.prefilterProg, 'u_texel');

    this.uDownTex = gl.getUniformLocation(this.kawaseDownProg, 'u_tex');
    this.uDownTexel = gl.getUniformLocation(this.kawaseDownProg, 'u_texel');

    this.uUpTex = gl.getUniformLocation(this.kawaseUpProg, 'u_tex');
    this.uUpTexel = gl.getUniformLocation(this.kawaseUpProg, 'u_texel');
    this.uUpWeight = gl.getUniformLocation(this.kawaseUpProg, 'u_weight');

    this.uCompScene = gl.getUniformLocation(this.compositeProg, 'u_scene');
    this.uCompBloom = gl.getUniformLocation(this.compositeProg, 'u_bloom');
    this.uCompPrev = gl.getUniformLocation(this.compositeProg, 'u_prev');
    this.uCompTime = gl.getUniformLocation(this.compositeProg, 'u_time');
    this.uCompIntensity = gl.getUniformLocation(this.compositeProg, 'u_intensity');
    this.uCompBloomScale = gl.getUniformLocation(this.compositeProg, 'u_bloom_scale');
    this.uCompScreenFlash = gl.getUniformLocation(this.compositeProg, 'u_screen_flash');
    this.uCompDamageFlash = gl.getUniformLocation(this.compositeProg, 'u_damage_flash');
    this.uCompLowHp = gl.getUniformLocation(this.compositeProg, 'u_low_hp');

    this.uCopyTex = gl.getUniformLocation(this.copyProg, 'u_tex');

    // Shared unit quad (-1..1).
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // Fullscreen & grid VAOs.
    this.fsVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.fsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.gridVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.gridVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Circle / SDF shape VAO (9 floats = 36 bytes per instance).
    this.circleInstanceBuf = gl.createBuffer()!;
    this.circleVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.circleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleInstanceBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, CIRCLE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, CIRCLE_STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, CIRCLE_STRIDE, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, CIRCLE_STRIDE, 28);
    gl.vertexAttribDivisor(4, 1);

    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, CIRCLE_STRIDE, 32);
    gl.vertexAttribDivisor(5, 1);

    // Beam VAO (11 floats = 44 bytes per instance).
    this.beamInstanceBuf = gl.createBuffer()!;
    this.beamVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.beamVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamInstanceBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, BEAM_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, BEAM_STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, BEAM_STRIDE, 16);
    gl.vertexAttribDivisor(3, 1);

    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, BEAM_STRIDE, 20);
    gl.vertexAttribDivisor(4, 1);

    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, BEAM_STRIDE, 36);
    gl.vertexAttribDivisor(5, 1);

    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, BEAM_STRIDE, 40);
    gl.vertexAttribDivisor(6, 1);

    gl.bindVertexArray(null);
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
      gl.deleteShader(shader);
      throw new Error(`Shader compile failed: ${log}`);
    }
    return shader;
  }

  private buildProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? 'unknown link error';
      gl.deleteProgram(prog);
      throw new Error(`Program link failed: ${log}`);
    }
    return prog;
  }

  private makeFbo(w: number, h: number): FBO {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internalFormat = this.halfFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  private destroyFbo(fbo: FBO | null): void {
    if (!fbo) return;
    this.gl.deleteFramebuffer(fbo.fb);
    this.gl.deleteTexture(fbo.tex);
  }

  private ensureFbos(w: number, h: number): void {
    if (w === this.fboW && h === this.fboH && this.sceneFbo) return;
    this.destroyFbo(this.sceneFbo);
    this.destroyFbo(this.persistFbo);
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.destroyFbo(this.bloomDownFbos[i] ?? null);
      this.destroyFbo(this.bloomUpFbos[i] ?? null);
    }

    this.sceneFbo = this.makeFbo(w, h);
    this.persistFbo = this.makeFbo(w, h);

    // Clear persistence buffer on resize.
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.persistFbo.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Build 4-level Dual Kawase pyramid: 1/2, 1/4, 1/8, 1/16 resolution.
    let bw = w;
    let bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
      this.bloomDownFbos[i] = this.makeFbo(bw, bh);
      this.bloomUpFbos[i] = this.makeFbo(bw, bh);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fboW = w;
    this.fboH = h;
  }

  public render(
    pixelW: number,
    pixelH: number,
    viewW: number,
    viewH: number,
    camera: [number, number],
    circleData: Float32Array,
    circleCount: number,
    beamData: Float32Array,
    beamCount: number,
    shake: [number, number],
    time: number,
    arenaRadius: number,
    fx: RenderFxParams,
  ): void {
    if (this.contextLost || pixelW < 2 || pixelH < 2) return;
    const gl = this.gl;
    this.ensureFbos(pixelW, pixelH);

    const sceneFbo = this.sceneFbo!;
    const persistFbo = this.persistFbo!;

    // ── Pass 1: Spherical crystal globe + starfield + caustics → HDR sceneFbo ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo.fb);
    gl.viewport(0, 0, pixelW, pixelH);
    gl.disable(gl.BLEND);
    gl.useProgram(this.gridProg);
    gl.uniform2f(this.uGridRes, viewW, viewH);
    gl.uniform2f(this.uGridCam, camera[0], camera[1]);
    gl.uniform2f(this.uGridShake, shake[0], shake[1]);
    gl.uniform1f(this.uGridRadius, arenaRadius);
    gl.uniform1f(this.uGridTime, time);
    gl.uniform1f(this.uGridIntensity, fx.intensity);
    gl.uniform1f(this.uGridBossMood, fx.bossMood);
    gl.bindVertexArray(this.gridVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 2: Instanced SDF shapes & optical plasma beams (additive HDR) ──
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    if (circleCount > 0) {
      gl.useProgram(this.circleProg);
      gl.uniform2f(this.uCircleRes, viewW, viewH);
      gl.uniform2f(this.uCircleCam, camera[0], camera[1]);
      gl.uniform2f(this.uCircleShake, shake[0], shake[1]);
      gl.uniform1f(this.uCircleRadius, arenaRadius);
      gl.uniform1f(this.uCircleTime, time);
      gl.bindVertexArray(this.circleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.circleInstanceBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        circleData.subarray(0, circleCount * CIRCLE_STRIDE_FLOATS),
        gl.STREAM_DRAW,
      );
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, circleCount);
    }

    if (beamCount > 0) {
      // Auto-attenuate per-beam HDR intensity when hundreds of beams overlap so late-game
      // refraction storms build vibrant layered spectral ribbons instead of flat whiteout!
      const beamDensity = 1.0 / Math.sqrt(1.0 + Math.max(0, beamCount - 14) / 34.0);
      gl.useProgram(this.beamProg);
      gl.uniform2f(this.uBeamRes, viewW, viewH);
      gl.uniform2f(this.uBeamCam, camera[0], camera[1]);
      gl.uniform2f(this.uBeamShake, shake[0], shake[1]);
      gl.uniform1f(this.uBeamRadius, arenaRadius);
      gl.uniform1f(this.uBeamTime, time);
      gl.uniform1f(this.uBeamDensity, beamDensity);
      gl.bindVertexArray(this.beamVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.beamInstanceBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        beamData.subarray(0, beamCount * BEAM_STRIDE_FLOATS),
        gl.STREAM_DRAW,
      );
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, beamCount);
    }

    // ── Pass 3: 4-Level Dual Kawase Bloom Pyramid ──
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.fsVao);

    // 3a. Soft-knee bright-pass prefilter: scene → down[0] (1/2 res).
    const d0 = this.bloomDownFbos[0]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, d0.fb);
    gl.viewport(0, 0, d0.w, d0.h);
    gl.useProgram(this.prefilterProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFbo.tex);
    gl.uniform1i(this.uPreTex, 0);
    gl.uniform2f(this.uPreTexel, 1 / pixelW, 1 / pixelH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3b. Downsample chain: down[0] → down[1] → down[2] → down[3] (1/16 res).
    gl.useProgram(this.kawaseDownProg);
    gl.uniform1i(this.uDownTex, 0);
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      const src = this.bloomDownFbos[i - 1]!;
      const dst = this.bloomDownFbos[i]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(this.uDownTexel, 1 / src.w, 1 / src.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 3c. Upsample pyramid: copy down[i] base + additive Dual Kawase upsample from up[i+1].
    // Seed coarsest level up[last] directly from down[last].
    const lastIdx = BLOOM_LEVELS - 1;
    const coarsestDown = this.bloomDownFbos[lastIdx]!;
    const coarsestUp = this.bloomUpFbos[lastIdx]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, coarsestUp.fb);
    gl.viewport(0, 0, coarsestUp.w, coarsestUp.h);
    gl.useProgram(this.copyProg);
    gl.bindTexture(gl.TEXTURE_2D, coarsestDown.tex);
    gl.uniform1i(this.uCopyTex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    for (let i = lastIdx - 1; i >= 0; i--) {
      const downCur = this.bloomDownFbos[i]!;
      const upPrev = this.bloomUpFbos[i + 1]!;
      const upCur = this.bloomUpFbos[i]!;

      // Copy current octave detail.
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, upCur.fb);
      gl.viewport(0, 0, upCur.w, upCur.h);
      gl.useProgram(this.copyProg);
      gl.bindTexture(gl.TEXTURE_2D, downCur.tex);
      gl.uniform1i(this.uCopyTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Additively blend 8-tap tent upsample from coarser octave.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.kawaseUpProg);
      gl.bindTexture(gl.TEXTURE_2D, upPrev.tex);
      gl.uniform1i(this.uUpTex, 0);
      gl.uniform2f(this.uUpTexel, 1 / upPrev.w, 1 / upPrev.h);
      gl.uniform1f(this.uUpWeight, BLOOM_UP_WEIGHTS[i] ?? 0.75);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── Pass 4: Final ACES Filmic Composite → Screen ──
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pixelW, pixelH);
    gl.useProgram(this.compositeProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFbo.tex);
    gl.uniform1i(this.uCompScene, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomUpFbos[0]!.tex);
    gl.uniform1i(this.uCompBloom, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, persistFbo.tex);
    gl.uniform1i(this.uCompPrev, 2);

    gl.uniform1f(this.uCompTime, time);
    gl.uniform1f(this.uCompIntensity, fx.intensity);
    gl.uniform1f(this.uCompBloomScale, this.bloomScale());
    gl.uniform1f(this.uCompScreenFlash, fx.screenFlash);
    gl.uniform1f(this.uCompDamageFlash, fx.damageFlash);
    gl.uniform1f(this.uCompLowHp, fx.lowHp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 5: Persist HDR scene for next frame's light trail ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, persistFbo.fb);
    gl.viewport(0, 0, pixelW, pixelH);
    gl.useProgram(this.copyProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFbo.tex);
    gl.uniform1i(this.uCopyTex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }
}
