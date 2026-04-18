// WebGL2 renderer for Prism. Renders geometry (additively blended) into an
// offscreen RGBA8 framebuffer, generates mipmaps, then does a full-screen
// composite pass with mip-based bloom, radial chromatic aberration, vignette,
// and tonemapping.

import {
  BEAM_FRAG,
  BEAM_VERT,
  CIRCLE_FRAG,
  CIRCLE_VERT,
  COMPOSITE_FRAG,
  FULLSCREEN_VERT,
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
  private compositeProg!: Program;

  private quadBuf!: WebGLBuffer;
  private circleInstanceBuf!: WebGLBuffer;
  private beamInstanceBuf!: WebGLBuffer;

  private circleVao!: WebGLVertexArrayObject;
  private beamVao!: WebGLVertexArrayObject;
  private fullscreenVao!: WebGLVertexArrayObject;

  private fbo!: WebGLFramebuffer;
  private fboTex!: WebGLTexture;
  private fboW = 0;
  private fboH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    this.circleProg = this.makeProgram(CIRCLE_VERT, CIRCLE_FRAG, ['u_viewport', 'u_camera']);
    this.beamProg = this.makeProgram(BEAM_VERT, BEAM_FRAG, ['u_viewport', 'u_camera']);
    this.compositeProg = this.makeProgram(FULLSCREEN_VERT, COMPOSITE_FRAG, ['u_scene']);

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

  resize(width: number, height: number) {
    const gl = this.gl;
    if (width === this.fboW && height === this.fboH && this.fbo) return;
    this.fboW = width;
    this.fboH = height;

    if (this.fboTex) gl.deleteTexture(this.fboTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);

    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture failed');
    this.fboTex = tex;
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('createFramebuffer failed');
    this.fbo = fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FBO incomplete: 0x${status.toString(16)}`);
    }
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
  ) {
    const gl = this.gl;
    this.resize(pixelWidth, pixelHeight);

    // Upload instance data. bufferData with the full ArrayBuffer view, sized
    // to exactly the count we're drawing — keeps uploads small.
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
    gl.blendFunc(gl.ONE, gl.ONE); // additive
    gl.disable(gl.DEPTH_TEST);

    // Beams first, then circles — so the player and enemy cores overlay beam trails.
    // Note: u_viewport is in world units (CSS pixels), not device pixels —
    // the shader's world↔clip math is independent of the backbuffer resolution.
    if (beamCount > 0) {
      gl.useProgram(this.beamProg.prog);
      gl.uniform2f(this.beamProg.uniforms['u_viewport']!, viewWidth, viewHeight);
      gl.uniform2f(this.beamProg.uniforms['u_camera']!, camera[0], camera[1]);
      gl.bindVertexArray(this.beamVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, beamCount);
    }

    if (circleCount > 0) {
      gl.useProgram(this.circleProg.prog);
      gl.uniform2f(this.circleProg.uniforms['u_viewport']!, viewWidth, viewHeight);
      gl.uniform2f(this.circleProg.uniforms['u_camera']!, camera[0], camera[1]);
      gl.bindVertexArray(this.circleVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, circleCount);
    }

    gl.bindVertexArray(null);

    // ── Generate mipmaps for mip-based bloom ──
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // ── Pass 2: composite to screen ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.compositeProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(this.compositeProg.uniforms['u_scene']!, 0);
    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}
