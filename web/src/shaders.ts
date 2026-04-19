// All GLSL 300 ES (WebGL2). Kept as template strings so Vite bundles them
// into the JS output — no separate fetch for shader files.

// ─── Circle shader ───────────────────────────────────────────────────────
// Instance attrs per circle: pos(2) + radius(1) + rgba(4) + glow(1) = 8 floats.
// We render each circle as a quad expanded beyond the radius to leave room
// for the glow falloff, then the SDF picks the shape back up.

const QUAD_EXPAND = 3.0; // quad edge sits at 3× the radius

export const CIRCLE_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 a_quad;      // per-vertex, -1..1

// per-instance
layout(location=1) in vec2 a_pos;
layout(location=2) in float a_radius;
layout(location=3) in vec4 a_color;
layout(location=4) in float a_glow;

uniform vec2 u_viewport;
uniform vec2 u_camera;
uniform vec2 u_shake;

out vec2 v_local;   // -QUAD_EXPAND..+QUAD_EXPAND; edge of circle at ±1
out vec4 v_color;
out float v_glow;

void main() {
  const float EXPAND = ${QUAD_EXPAND.toFixed(1)};
  v_local = a_quad * EXPAND;
  v_color = a_color;
  v_glow = a_glow;

  vec2 world = a_pos + a_quad * a_radius * EXPAND;
  vec2 screen = world - u_camera + u_viewport * 0.5 + u_shake;
  vec2 clip = (screen / u_viewport) * 2.0 - 1.0;
  clip.y = -clip.y;

  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const CIRCLE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_color;
in float v_glow;

out vec4 fragColor;

void main() {
  float d = length(v_local);

  // Solid core with antialiased edge at d = 1.0
  float core = 1.0 - smoothstep(0.94, 1.04, d);
  // Soft exponential glow that falls off through the expanded quad
  float glow = exp(-d * d * 0.9) * v_glow;

  vec3 col = v_color.rgb * (core + glow);
  float alpha = max(core * v_color.a, glow * 0.6);
  fragColor = vec4(col * alpha, alpha);
}
`;

// ─── Beam shader ─────────────────────────────────────────────────────────
// Instance attrs per beam: p0(2) + p1(2) + thickness(1) + rgba(4) + glow(1) = 10 floats.
// Vertex shader builds an oriented bounding rect around the segment; fragment
// uses an SDF capsule with:
//   - White-hot inner core
//   - Spectral rainbow fringe on the outer edge
//   - Noise-based energy ripple along the beam length
//   - Wide exponential glow falloff in the beam's tint color

export const BEAM_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 a_quad;

layout(location=1) in vec2 a_p0;
layout(location=2) in vec2 a_p1;
layout(location=3) in float a_thickness;
layout(location=4) in vec4 a_color;
layout(location=5) in float a_glow;

uniform vec2 u_viewport;
uniform vec2 u_camera;
uniform vec2 u_shake;
uniform float u_time;

out vec2 v_world;
out vec2 v_p0;
out vec2 v_p1;
out float v_thickness;
out vec4 v_color;
out float v_glow;
out float v_time;

void main() {
  float pad = 12.0 + a_thickness * 3.5;

  vec2 delta = a_p1 - a_p0;
  float len = length(delta);
  vec2 dir = len > 1e-5 ? delta / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 center = (a_p0 + a_p1) * 0.5;

  float halfLen = len * 0.5 + pad;
  float halfThick = a_thickness * 0.5 + pad;

  vec2 world = center + dir * (a_quad.x * halfLen) + perp * (a_quad.y * halfThick);

  v_world = world;
  v_p0 = a_p0;
  v_p1 = a_p1;
  v_thickness = a_thickness;
  v_color = a_color;
  v_glow = a_glow;
  v_time = u_time;

  vec2 screen = world - u_camera + u_viewport * 0.5 + u_shake;
  vec2 clip = (screen / u_viewport) * 2.0 - 1.0;
  clip.y = -clip.y;

  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const BEAM_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_world;
in vec2 v_p0;
in vec2 v_p1;
in float v_thickness;
in vec4 v_color;
in float v_glow;
in float v_time;

out vec4 fragColor;

// SDF: distance from point p to segment (a, b), plus parametric t along segment.
vec2 sdSegmentT(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  float d = length(pa - ba * t);
  return vec2(d, t);
}

// Spectral rainbow: maps a 0-1 value to a smooth RGB rainbow.
vec3 spectral(float t) {
  vec3 c = vec3(
    0.5 + 0.5 * cos(6.28318 * (t + 0.0)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.33)),
    0.5 + 0.5 * cos(6.28318 * (t + 0.67))
  );
  return c;
}

// Fast hash-based noise for energy ripple.
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise1d(float p) {
  float fl = floor(p);
  float fc = fract(p);
  fc = fc * fc * (3.0 - 2.0 * fc);
  return mix(hash(fl), hash(fl + 1.0), fc);
}

void main() {
  vec2 dt = sdSegmentT(v_world, v_p0, v_p1);
  float dist = dt.x;
  float t = dt.y;
  float r = v_thickness * 0.5;

  // Energy ripple along beam length — scrolling noise pattern.
  float ripple = noise1d(t * 12.0 + v_time * 25.0) * 0.3 + 0.85;
  float ripple2 = noise1d(t * 20.0 - v_time * 18.0) * 0.2 + 0.9;
  float energy = ripple * ripple2;

  // Core zones (from center outward):
  // Zone 1: white-hot inner core (0 to r*0.35)
  // Zone 2: beam color (r*0.35 to r*0.85)
  // Zone 3: spectral fringe (r*0.85 to r*1.15)
  // Zone 4: outer glow falloff (r*1.15+)

  float innerEdge = r * 0.35;
  float colorEdge = r * 0.85;
  float fringeEdge = r * 1.15;

  // White-hot inner core — saturated center.
  float innerCore = 1.0 - smoothstep(innerEdge - 0.5, innerEdge + 0.5, dist);
  vec3 hotWhite = vec3(1.0, 0.98, 0.95);

  // Main color body.
  float colorBody = (1.0 - smoothstep(colorEdge - 1.0, colorEdge + 1.0, dist));
  vec3 beamColor = v_color.rgb;

  // Spectral fringe — rainbow dispersion at beam edges.
  float fringeZone = smoothstep(colorEdge - 1.0, colorEdge + 0.5, dist)
                   * (1.0 - smoothstep(fringeEdge - 0.5, fringeEdge + 2.0, dist));
  // Shift the spectrum based on angle from beam center + time for shimmer.
  float specPhase = dist / max(r, 1.0) + t * 0.5 + v_time * 0.4;
  vec3 rainbow = spectral(specPhase) * 1.3;

  // Outer glow falloff.
  float glowDist = max(dist - r, 0.0);
  float glow = exp(-glowDist * 0.12) * v_glow;

  // Compose layers.
  vec3 col = hotWhite * innerCore * energy * 2.0
           + beamColor * colorBody * energy * 1.5
           + rainbow * fringeZone * energy * 0.9
           + beamColor * glow * 0.6;

  float alpha = max(colorBody * v_color.a * energy,
                max(innerCore * energy,
                max(fringeZone * 0.8 * energy,
                    glow * 0.45)));

  fragColor = vec4(col * alpha, alpha);
}
`;

// ─── Background grid shader ─────────────────────────────────────────────
// Renders a subtle hexagonal grid that provides spatial grounding. The grid
// scrolls with the camera to give a sense of movement through space.

export const GRID_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 a_quad;

out vec2 v_uv;

void main() {
  v_uv = a_quad * 0.5 + 0.5;
  gl_Position = vec4(a_quad, 0.0, 1.0);
}
`;

export const GRID_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 u_viewport;
uniform vec2 u_camera;
uniform float u_time;
uniform float u_arena_radius;

in vec2 v_uv;
out vec4 fragColor;

// Hex grid distance — returns distance to nearest hex edge.
float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.73205))), p.x);
}

vec4 hexCoords(vec2 uv) {
  const vec2 s = vec2(1.0, 1.73205);
  vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(uv - hC.xy * s, uv - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw)
    ? vec4(h.xy, hC.xy)
    : vec4(h.zw, hC.zw + 0.5);
}

void main() {
  // Convert screen UV to world coordinates.
  vec2 world = (v_uv - 0.5) * u_viewport + u_camera;

  // Hex grid — scale controls hex size (larger = bigger hexes).
  float hexScale = 60.0;
  vec2 hexUV = world / hexScale;
  vec4 hx = hexCoords(hexUV);

  // Distance from hex center to edge.
  float edgeDist = hexDist(hx.xy);

  // Thin hex grid lines.
  float gridLine = 1.0 - smoothstep(0.42, 0.5, edgeDist);

  // Arena boundary — soft glow ring.
  float distFromOrigin = length(world);
  float arenaEdge = smoothstep(u_arena_radius - 80.0, u_arena_radius, distFromOrigin);
  float arenaGlow = exp(-max(distFromOrigin - u_arena_radius, 0.0) * 0.015) * arenaEdge;
  float arenaLine = smoothstep(u_arena_radius - 3.0, u_arena_radius, distFromOrigin)
                  * (1.0 - smoothstep(u_arena_radius, u_arena_radius + 3.0, distFromOrigin));

  // Arena pulse — breathing effect.
  float pulse = 0.7 + 0.3 * sin(u_time * 1.5);

  // Distance fade — grid fades near edges of visible area.
  float distFade = 1.0 - smoothstep(u_arena_radius * 0.3, u_arena_radius * 0.95, distFromOrigin);

  // Compose grid: very subtle blue-violet lines.
  vec3 gridColor = vec3(0.15, 0.12, 0.35) * gridLine * 0.35 * distFade;

  // Arena wall: bright cyan-white with colored glow.
  vec3 wallColor = vec3(0.3, 0.7, 1.0) * arenaLine * 2.5 * pulse
                 + vec3(0.2, 0.4, 0.9) * arenaGlow * 0.8 * pulse;

  // Player proximity brightening — handled by uniform later if needed.
  vec3 col = gridColor + wallColor;
  float alpha = max(gridLine * 0.12 * distFade, arenaLine * 0.9 + arenaGlow * 0.4);

  fragColor = vec4(col, alpha);
}
`;

// ─── Bloom downsample / upsample ─────────────────────────────────────────
// Proper multi-pass dual-filter bloom: downsample through a chain of
// progressively smaller FBOs, then upsample back up with additive blending.
// Eliminates the blocky artifacts of single-sample mipmap-based bloom.

// Downsample: 9-tap tent filter. u_texel is 1/source_resolution.
export const BLOOM_DOWN_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 a = texture(u_src, v_uv + vec2(-1.0, -1.0) * u_texel).rgb;
  vec3 b = texture(u_src, v_uv + vec2( 0.0, -1.0) * u_texel).rgb;
  vec3 c = texture(u_src, v_uv + vec2( 1.0, -1.0) * u_texel).rgb;
  vec3 d = texture(u_src, v_uv + vec2(-1.0,  0.0) * u_texel).rgb;
  vec3 e = texture(u_src, v_uv).rgb;
  vec3 f = texture(u_src, v_uv + vec2( 1.0,  0.0) * u_texel).rgb;
  vec3 g = texture(u_src, v_uv + vec2(-1.0,  1.0) * u_texel).rgb;
  vec3 h = texture(u_src, v_uv + vec2( 0.0,  1.0) * u_texel).rgb;
  vec3 i = texture(u_src, v_uv + vec2( 1.0,  1.0) * u_texel).rgb;

  vec3 col = e * 0.25
           + (b + d + f + h) * 0.125
           + (a + c + g + i) * 0.0625;

  fragColor = vec4(col, 1.0);
}
`;

// Upsample: Bicubic B-spline filter (4 optimized bilinear taps).
// Eliminates blocky/staircase artifacts from bilinear-only upsampling.
// Ported from Unity URP SampleTexture2DBicubic (Filtering.hlsl).
// u_texel is 1/source_resolution.
export const BLOOM_UP_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Convert UV to texel-space (cell-centered, shifted +0.5)
  vec2 texSize = 1.0 / u_texel;
  vec2 xy = v_uv * texSize + 0.5;
  vec2 ic = floor(xy);
  vec2 fc = xy - ic;

  // Cubic B-spline basis weights at fractional position fc
  vec2 r  = 0.16666667 + fc * (-0.5 + fc * (0.5 - fc * 0.16666667));
  vec2 mr = 0.66666667 + fc * (-1.0 + 0.5 * fc) * fc;
  vec2 ml = 0.16666667 + fc * (0.5 + fc * (0.5 - fc * 0.5));
  vec2 l  = 1.0 - mr - ml - r;

  // Pair weights for 4 bilinear taps (collapse 4x4 to 2x2)
  vec2 w0 = r + mr;
  vec2 w1 = ml + l;
  vec2 o0 = -1.0 + mr / w0;
  vec2 o1 =  1.0 + l  / w1;

  // 4 bilinear taps at optimized positions
  vec2 uv00 = (ic + vec2(o0.x, o0.y) - 0.5) * u_texel;
  vec2 uv10 = (ic + vec2(o1.x, o0.y) - 0.5) * u_texel;
  vec2 uv01 = (ic + vec2(o0.x, o1.y) - 0.5) * u_texel;
  vec2 uv11 = (ic + vec2(o1.x, o1.y) - 0.5) * u_texel;

  vec3 col = w0.y * (w0.x * texture(u_src, uv00).rgb +
                      w1.x * texture(u_src, uv10).rgb) +
             w1.y * (w0.x * texture(u_src, uv01).rgb +
                      w1.x * texture(u_src, uv11).rgb);

  fragColor = vec4(col, 1.0);
}
`;

// ─── Full-screen composite ───────────────────────────────────────────────
// Reads base scene + bloom result from dual-filter chain. Applies
// chromatic aberration, temporal persistence, vignette, and Reinhard tonemap.

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 a_quad;
out vec2 v_uv;
void main() {
  v_uv = a_quad * 0.5 + 0.5;
  gl_Position = vec4(a_quad, 0.0, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_prev;
uniform float u_persistence;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 dir = v_uv - 0.5;

  // Radial chromatic aberration — stronger toward the edges.
  float aberr = 0.002 + length(dir) * 0.005;

  vec3 base;
  base.r = texture(u_scene, v_uv + dir * aberr).r;
  base.g = texture(u_scene, v_uv).g;
  base.b = texture(u_scene, v_uv - dir * aberr).b;

  // Temporal persistence — blend previous frame for light trails.
  vec3 prev = texture(u_prev, v_uv).rgb;
  base = max(base, prev * u_persistence);

  // Bloom from multi-pass dual-filter chain.
  vec3 bloom = texture(u_bloom, v_uv).rgb;

  vec3 col = base + bloom * 0.7;

  // Vignette — subtle darkening at edges.
  col *= 1.0 - length(dir) * 0.5;

  // Reinhard tonemap + gamma.
  col = col / (1.0 + col);
  col = pow(col, vec3(1.0 / 2.2));

  fragColor = vec4(col, 1.0);
}
`;

// ─── Persistence copy shader ─────────────────────────────────────────────
// Simple blit of the composited frame into the persistence buffer.

export const COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  fragColor = texture(u_src, v_uv);
}
`;

