// WebGL2 renderer for Prism. Multi-pass pipeline:
//   1. Background grid (parallax hex grid + arena boundary)
//   2. Geometry pass: beams (spectral fringe + energy ripple) + circles → HDR FBO
//   3. Mipmap bloom generation
//   4. Composite: chromatic aberration + temporal persistence + bloom + vignette + tonemap

import {
  BEAM_FRAG,
  BEAM_VERT,
  BLOOM_DOWN_FRAG,
  BLOOM_UP_FRAG,
  CIRCLE_FRAG,
  CIRCLE_VERT,
  COMPOSITE_FRAG,
  COPY_FRAG,
  FULLSCREEN_VERT,
  GRID_FRAG,
  GRID_VERT,
} from './shaders.js';

const CIRCLE_STRIDE_FLOATS = 8;
const BEAM_STRIDE_FLOATS = 10;

// Bytes per instance.
const CIRCLE_STRIDE = CIRCLE_STRIDE_FLOATS * 4;
const BEAM_STRIDE = BEAM_STRIDE_FLOATS * 4;

interface Program {
  prog: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class Renderer {
  private gl: WebGL2RenderingContext;

  private circleProg!: Program;
  private beamProg!: Program;
  private gridProg!: Program;
  private bloomDownProg!: Program;
  private bloomUpProg!: Program;
  private compositeProg!: Program;
  private copyProg!: Program;

  private quadBuf!: WebGLBuffer;
  private circleInstanceBuf!: WebGLBuffer;
  private beamInstanceBuf!: WebGLBuffer;

  private circleVao!: WebGLVertexArrayObject;
  private beamVao!: WebGLVertexArrayObject;
  private fullscreenVao!: WebGLVertexArrayObject;

  // Main scene FBO (HDR).
  private fbo!: WebGLFramebuffer;
  private fboTex!: WebGLTexture;

  // Persistence FBO — stores previous frame for light trails.
  private prevFbo!: WebGLFramebuffer;
  private prevTex!: WebGLTexture;

  // Bloom FBO chain — progressively halved resolutions.
  private static readonly BLOOM_LEVELS = 5;
  private bloomFbos: WebGLFramebuffer[] = [];
  private bloomTexs: WebGLTexture[] = [];
  private bloomSizes: [number, number][] = [];

  private fboW = 0;
  private fboH = 0;
  private hasColorBufferFloat = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // EXT_color_buffer_float is required for RGBA16F render targets in WebGL2.
    this.hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');

    this.circleProg = this.makeProgram(CIRCLE_VERT, CIRCLE_FRAG, ['u_viewport', 'u_camera', 'u_shake']);
    this.beamProg = this.makeProgram(BEAM_VERT, BEAM_FRAG, ['u_viewport', 'u_camera', 'u_shake', 'u_time']);
    this.gridProg = this.makeProgram(GRID_VERT, GRID_FRAG, ['u_viewport', 'u_camera', 'u_time', 'u_arena_radius']);
    this.bloomDownProg = this.makeProgram(FULLSCREEN_VERT, BLOOM_DOWN_FRAG, ['u_src', 'u_texel']);
    this.bloomUpProg = this.makeProgram(FULLSCREEN_VERT, BLOOM_UP_FRAG, ['u_src', 'u_texel']);
    this.compositeProg = this.makeProgram(FULLSCREEN_VERT, COMPOSITE_FRAG, ['u_scene', 'u_bloom', 'u_prev', 'u_persistence']);
    this.copyProg = this.makeProgram(FULLSCREEN_VERT, COPY_FRAG, ['u_src']);

    this.setupBuffers();
  }

  // ─── Setup ──────────────────────────────────────────────────────────────

  private makeProgram(vertSrc: string, fragSrc: string, uniformNames: string[]): Program {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error('createProgram failed');
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? 'unknown';
      throw new Error(`program link failed: ${log}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(prog, name);
    }
    return { prog, uniforms };
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('createShader failed');
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'unknown';
      const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      gl.deleteShader(shader);
      throw new Error(`${kind} shader compile failed: ${log}`);
    }
    return shader;
  }

  private setupBuffers() {
    const gl = this.gl;

    // Shared -1..1 quad used by circle, beam, and fullscreen programs.
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
    const quadBuf = gl.createBuffer();
    if (!quadBuf) throw new Error('createBuffer failed');
    this.quadBuf = quadBuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    // Circle instance buffer.
    const circleBuf = gl.createBuffer();
    if (!circleBuf) throw new Error('createBuffer failed');
    this.circleInstanceBuf = circleBuf;

    // Beam instance buffer.
    const beamBuf = gl.createBuffer();
    if (!beamBuf) throw new Error('createBuffer failed');
    this.beamInstanceBuf = beamBuf;

    // Circle VAO.
    const circleVao = gl.createVertexArray();
    if (!circleVao) throw new Error('createVertexArray failed');
    this.circleVao = circleVao;
    gl.bindVertexArray(this.circleVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleInstanceBuf);
    // Layout: pos(2) radius(1) color(4) glow(1) — offsets in bytes.
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

    gl.bindVertexArray(null);

    // Beam VAO.
    const beamVao = gl.createVertexArray();
    if (!beamVao) throw new Error('createVertexArray failed');
    this.beamVao = beamVao;
    gl.bindVertexArray(this.beamVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamInstanceBuf);
    // Layout: p0(2) p1(2) thickness(1) color(4) glow(1)
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

    gl.bindVertexArray(null);

    // Fullscreen VAO (just the quad).
    const fullscreenVao = gl.createVertexArray();
    if (!fullscreenVao) throw new Error('createVertexArray failed');
    this.fullscreenVao = fullscreenVao;
    gl.bindVertexArray(this.fullscreenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // ─── Resize / FBO ───────────────────────────────────────────────────────

  private makeTexture(width: number, height: number, mipmapped: boolean): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.hasColorBufferFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private makeFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('createFramebuffer failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FBO incomplete: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  resize(width: number, height: number) {
    const gl = this.gl;
    if (width === this.fboW && height === this.fboH && this.fbo) return;
    this.fboW = width;
    this.fboH = height;

    // Clean up old resources.
    if (this.fboTex) gl.deleteTexture(this.fboTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.prevTex) gl.deleteTexture(this.prevTex);
    if (this.prevFbo) gl.deleteFramebuffer(this.prevFbo);
    for (const tex of this.bloomTexs) gl.deleteTexture(tex);
    for (const fbo of this.bloomFbos) gl.deleteFramebuffer(fbo);

    // Main scene FBO — no mipmaps needed (bloom uses FBO chain now).
    this.fboTex = this.makeTexture(width, height, false);
    this.fbo = this.makeFbo(this.fboTex);

    // Persistence FBO — stores previous frame for light trails.
    this.prevTex = this.makeTexture(width, height, false);
    this.prevFbo = this.makeFbo(this.prevTex);

    // Bloom FBO chain at 1/2, 1/4, 1/8, 1/16, 1/32 resolution.
    this.bloomFbos = [];
    this.bloomTexs = [];
    this.bloomSizes = [];
    let bw = Math.max(1, width >> 1);
    let bh = Math.max(1, height >> 1);
    for (let i = 0; i < Renderer.BLOOM_LEVELS; i++) {
      const tex = this.makeTexture(bw, bh, false);
      const fbo = this.makeFbo(tex);
      this.bloomTexs.push(tex);
      this.bloomFbos.push(fbo);
      this.bloomSizes.push([bw, bh]);
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
    }

    // Clear the persistence buffer to black.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prevFbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ─── Frame ─────────────────────────────────────────────────────────────

  render(
    pixelWidth: number,
    pixelHeight: number,
    viewWidth: number,
    viewHeight: number,
    camera: [number, number],
    circleData: Float32Array,
    circleCount: number,
    beamData: Float32Array,
    beamCount: number,
    shake: [number, number] = [0, 0],
    time: number = 0,
    arenaRadius: number = 1200,
  ) {
    const gl = this.gl;
    this.resize(pixelWidth, pixelHeight);

    // Upload instance data.
    if (circleCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.circleInstanceBuf);
      gl.bufferData(gl.ARRAY_BUFFER, circleData.subarray(0, circleCount * CIRCLE_STRIDE_FLOATS), gl.STREAM_DRAW);
    }
    if (beamCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.beamInstanceBuf);
      gl.bufferData(gl.ARRAY_BUFFER, beamData.subarray(0, beamCount * BEAM_STRIDE_FLOATS), gl.STREAM_DRAW);
    }

    // ── Pass 1: geometry → offscreen HDR framebuffer, additive ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, pixelWidth, pixelHeight);

    // Dark near-black background with a whisper of violet.
    gl.clearColor(0.012, 0.008, 0.025, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // Background grid: alpha blend, not additive, so it stays subtle.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.gridProg.prog);
    gl.uniform2f(this.gridProg.uniforms['u_viewport']!, viewWidth, viewHeight);
    gl.uniform2f(this.gridProg.uniforms['u_camera']!, camera[0], camera[1]);
    gl.uniform1f(this.gridProg.uniforms['u_time']!, time);
    gl.uniform1f(this.gridProg.uniforms['u_arena_radius']!, arenaRadius);
    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Switch to additive blending for game geometry.
    gl.blendFunc(gl.ONE, gl.ONE);

    // Beams first, then circles — so the player and enemy cores overlay beam trails.
    if (beamCount > 0) {
      gl.useProgram(this.beamProg.prog);
      gl.uniform2f(this.beamProg.uniforms['u_viewport']!, viewWidth, viewHeight);
      gl.uniform2f(this.beamProg.uniforms['u_camera']!, camera[0], camera[1]);
      gl.uniform2f(this.beamProg.uniforms['u_shake']!, shake[0], shake[1]);
      gl.uniform1f(this.beamProg.uniforms['u_time']!, time);
      gl.bindVertexArray(this.beamVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, beamCount);
    }

    if (circleCount > 0) {
      gl.useProgram(this.circleProg.prog);
      gl.uniform2f(this.circleProg.uniforms['u_viewport']!, viewWidth, viewHeight);
      gl.uniform2f(this.circleProg.uniforms['u_camera']!, camera[0], camera[1]);
      gl.uniform2f(this.circleProg.uniforms['u_shake']!, shake[0], shake[1]);
      gl.bindVertexArray(this.circleVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, circleCount);
    }

    gl.bindVertexArray(null);

    // ── Bloom: multi-pass downsample → upsample chain ──
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.fullscreenVao);

    // Downsample: scene → bloom[0] → bloom[1] → ... → bloom[N-1]
    gl.useProgram(this.bloomDownProg.prog);
    for (let i = 0; i < Renderer.BLOOM_LEVELS; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[i]);
      gl.viewport(0, 0, this.bloomSizes[i][0], this.bloomSizes[i][1]);
      const srcTex = i === 0 ? this.fboTex : this.bloomTexs[i - 1];
      const srcW = i === 0 ? pixelWidth : this.bloomSizes[i - 1][0];
      const srcH = i === 0 ? pixelHeight : this.bloomSizes[i - 1][1];
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(this.bloomDownProg.uniforms['u_src']!, 0);
      gl.uniform2f(this.bloomDownProg.uniforms['u_texel']!, 1.0 / srcW, 1.0 / srcH);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Upsample: bloom[N-1] → bloom[N-2] → ... → bloom[0] (additive)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.bloomUpProg.prog);
    for (let i = Renderer.BLOOM_LEVELS - 2; i >= 0; i--) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[i]);
      gl.viewport(0, 0, this.bloomSizes[i][0], this.bloomSizes[i][1]);
      const srcTex = this.bloomTexs[i + 1];
      const srcW = this.bloomSizes[i + 1][0];
      const srcH = this.bloomSizes[i + 1][1];
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(this.bloomUpProg.uniforms['u_src']!, 0);
      gl.uniform2f(this.bloomUpProg.uniforms['u_texel']!, 1.0 / srcW, 1.0 / srcH);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);

    // ── Pass 2: composite to screen with bloom + temporal persistence ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.compositeProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(this.compositeProg.uniforms['u_scene']!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTexs[0]);
    gl.uniform1i(this.compositeProg.uniforms['u_bloom']!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTex);
    gl.uniform1i(this.compositeProg.uniforms['u_prev']!, 2);
    gl.uniform1f(this.compositeProg.uniforms['u_persistence']!, 0.82);
    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // ── Copy scene → prev texture for next frame's persistence ──
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.prevFbo);
    gl.blitFramebuffer(0, 0, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }
}
