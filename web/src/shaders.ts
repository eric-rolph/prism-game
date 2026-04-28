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
uniform float u_arena_radius;

out vec2 v_local;   // -QUAD_EXPAND..+QUAD_EXPAND; edge of circle at ±1
out vec4 v_color;
out float v_glow;

vec2 projectGlobe(vec2 local, float radius) {
  float d = length(local);
  if (d < 1e-4) return local;
  float theta = min(d / radius, 1.55334);
  return local * (sin(theta) * radius / d);
}

void main() {
  const float EXPAND = ${QUAD_EXPAND.toFixed(1)};
  v_local = a_quad * EXPAND;
  v_color = a_color;
  v_glow = a_glow;

  vec2 local = (a_pos - u_camera) + a_quad * a_radius * EXPAND;
  vec2 screen = projectGlobe(local, max(u_arena_radius, 1.0)) + u_viewport * 0.5 + u_shake;
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
uniform float u_arena_radius;

out vec2 v_world;
out vec2 v_p0;
out vec2 v_p1;
out float v_thickness;
out vec4 v_color;
out float v_glow;
out float v_time;

vec2 projectGlobe(vec2 local, float radius) {
  float d = length(local);
  if (d < 1e-4) return local;
  float theta = min(d / radius, 1.55334);
  return local * (sin(theta) * radius / d);
}

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
  vec2 local = world - u_camera;

  v_world = local;
  v_p0 = a_p0 - u_camera;
  v_p1 = a_p1 - u_camera;
  v_thickness = a_thickness;
  v_color = a_color;
  v_glow = a_glow;
  v_time = u_time;

  vec2 screen = projectGlobe(local, max(u_arena_radius, 1.0)) + u_viewport * 0.5 + u_shake;
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

// ─── Background globe shader ─────────────────────────────────────────────
// Renders the play field as a seamless local patch of a traversable globe.
// World x/y are arc lengths: x is longitude, y is meridian travel.

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

const float PI = 3.14159265;
const float TAU = 6.28318531;

float angularLine(float angle, float period, float width) {
  float d = abs(fract(angle / period + 0.5) - 0.5) * period;
  return 1.0 - smoothstep(width, width * 1.8, d);
}

vec3 globeNormalFromLonLat(float lon, float lat) {
  float c = cos(lat);
  return normalize(vec3(sin(lon) * c, sin(lat), cos(lon) * c));
}

vec3 globeEast(float lon) {
  return normalize(vec3(cos(lon), 0.0, -sin(lon)));
}

vec3 globeNorth(float lon, float lat) {
  return normalize(vec3(-sin(lon) * sin(lat), cos(lat), -cos(lon) * sin(lat)));
}

void main() {
  float radius = max(u_arena_radius, 1.0);
  vec2 screen = vec2((v_uv.x - 0.5) * u_viewport.x, (0.5 - v_uv.y) * u_viewport.y);
  float screenR = length(screen);
  float sphereMask = 1.0 - smoothstep(radius - 8.0, radius + 18.0, screenR);
  if (sphereMask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float camLon = u_camera.x / radius;
  float camLat = u_camera.y / radius;
  vec3 center = globeNormalFromLonLat(camLon, camLat);
  vec3 east = globeEast(camLon);
  vec3 north = globeNorth(camLon, camLat);
  float z = sqrt(max(radius * radius - screenR * screenR, 0.0));
  vec3 normal = normalize(center * z + east * screen.x + north * screen.y);

  float longitude = atan(normal.x, normal.z);
  float latitude = asin(clamp(normal.y, -1.0, 1.0));

  float meridians = angularLine(longitude, TAU / 24.0, 0.0032);
  float parallels = angularLine(latitude, PI / 14.0, 0.0032);
  float equator = angularLine(latitude, PI, 0.006);
  float gridLine = max(max(meridians, parallels), equator * 0.75);

  float pulse = 0.7 + 0.3 * sin(u_time * 1.5);
  vec3 lightDir = normalize(vec3(-0.35, 0.48, 0.80));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float polarGlow = pow(abs(normal.y), 10.0);
  float dateLine = angularLine(longitude, PI, 0.005);
  float limb = pow(1.0 - clamp(z / radius, 0.0, 1.0), 2.2);

  vec3 surfaceColor = vec3(0.010, 0.015, 0.040) * (0.50 + diffuse * 0.50)
                    + vec3(0.010, 0.065, 0.105) * (0.35 + 0.65 * normal.y * normal.y)
                    + vec3(0.045, 0.020, 0.090) * limb * 0.65;
  vec3 gridColor = vec3(0.10, 0.50, 0.88) * gridLine * (0.10 + limb * 0.06);
  vec3 landmarkColor = vec3(0.22, 0.78, 1.00) * (polarGlow * 0.16 + dateLine * 0.08 * pulse);

  vec3 col = surfaceColor + gridColor + landmarkColor;
  float alpha = (0.11 + gridLine * 0.08 + polarGlow * 0.05 + limb * 0.07) * sphereMask;

  fragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

// ─── Bloom: separable Gaussian ───────────────────────────────────────────
// Architecture: scene→half-res (box downsample) → H→V × 2 cycles (Gaussian)
//               → full-res (9-tap tent upsample) → composite.
//
// WHY separable: 2D Gaussian = G1D_H × G1D_V, which is radially symmetric.
// A single-pass 2D grid kernel (tent/box) is a separable BOX filter, which
// produces SQUARE bloom. Doing H then V with Gaussian weights produces
// circular bloom with zero staircase/block artifacts regardless of resolution.

// Downsample: 4-tap box filter. Maps 2×2 source pixels → 1 output pixel.
// u_texel = 1/source_resolution.
export const BLOOM_DOWN_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Sample at ±0.5 texel — each bilinear tap averages a 2×2 source block.
  vec3 a = texture(u_src, v_uv + vec2(-0.5, -0.5) * u_texel).rgb;
  vec3 b = texture(u_src, v_uv + vec2( 0.5, -0.5) * u_texel).rgb;
  vec3 c = texture(u_src, v_uv + vec2(-0.5,  0.5) * u_texel).rgb;
  vec3 d = texture(u_src, v_uv + vec2( 0.5,  0.5) * u_texel).rgb;
  fragColor = vec4((a + b + c + d) * 0.25, 1.0);
}
`;

// Horizontal 13-tap Gaussian pass (σ=2.0 in half-res texels = σ=4 screen px).
// u_texel = 1/source_resolution (half-res FBO).
export const BLOOM_H_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 col =
    texture(u_src, v_uv + vec2(-6.0, 0.0) * u_texel).rgb * 0.0022 +
    texture(u_src, v_uv + vec2(-5.0, 0.0) * u_texel).rgb * 0.0088 +
    texture(u_src, v_uv + vec2(-4.0, 0.0) * u_texel).rgb * 0.0270 +
    texture(u_src, v_uv + vec2(-3.0, 0.0) * u_texel).rgb * 0.0649 +
    texture(u_src, v_uv + vec2(-2.0, 0.0) * u_texel).rgb * 0.1211 +
    texture(u_src, v_uv + vec2(-1.0, 0.0) * u_texel).rgb * 0.1760 +
    texture(u_src, v_uv                  ).rgb * 0.1997 +
    texture(u_src, v_uv + vec2( 1.0, 0.0) * u_texel).rgb * 0.1760 +
    texture(u_src, v_uv + vec2( 2.0, 0.0) * u_texel).rgb * 0.1211 +
    texture(u_src, v_uv + vec2( 3.0, 0.0) * u_texel).rgb * 0.0649 +
    texture(u_src, v_uv + vec2( 4.0, 0.0) * u_texel).rgb * 0.0270 +
    texture(u_src, v_uv + vec2( 5.0, 0.0) * u_texel).rgb * 0.0088 +
    texture(u_src, v_uv + vec2( 6.0, 0.0) * u_texel).rgb * 0.0022;
  fragColor = vec4(col, 1.0);
}
`;

// Vertical 13-tap Gaussian pass (σ=2.0 in half-res texels = σ=4 screen px).
// Applied after BLOOM_H_FRAG; H×V = circular 2D Gaussian — no square bloom.
export const BLOOM_V_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 col =
    texture(u_src, v_uv + vec2(0.0, -6.0) * u_texel).rgb * 0.0022 +
    texture(u_src, v_uv + vec2(0.0, -5.0) * u_texel).rgb * 0.0088 +
    texture(u_src, v_uv + vec2(0.0, -4.0) * u_texel).rgb * 0.0270 +
    texture(u_src, v_uv + vec2(0.0, -3.0) * u_texel).rgb * 0.0649 +
    texture(u_src, v_uv + vec2(0.0, -2.0) * u_texel).rgb * 0.1211 +
    texture(u_src, v_uv + vec2(0.0, -1.0) * u_texel).rgb * 0.1760 +
    texture(u_src, v_uv                  ).rgb * 0.1997 +
    texture(u_src, v_uv + vec2(0.0,  1.0) * u_texel).rgb * 0.1760 +
    texture(u_src, v_uv + vec2(0.0,  2.0) * u_texel).rgb * 0.1211 +
    texture(u_src, v_uv + vec2(0.0,  3.0) * u_texel).rgb * 0.0649 +
    texture(u_src, v_uv + vec2(0.0,  4.0) * u_texel).rgb * 0.0270 +
    texture(u_src, v_uv + vec2(0.0,  5.0) * u_texel).rgb * 0.0088 +
    texture(u_src, v_uv + vec2(0.0,  6.0) * u_texel).rgb * 0.0022;
  fragColor = vec4(col, 1.0);
}
`;

// Final upsample: 9-tap tent filter from half-res bloom to full-res.
// This removes the visible half-res cell edges that survive a naked bilinear
// stretch, especially around bright additive primitives.
export const BLOOM_UP_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 dx = vec2(u_texel.x, 0.0);
  vec2 dy = vec2(0.0, u_texel.y);

  vec3 col =
    texture(u_src, v_uv - dx - dy).rgb * 1.0 +
    texture(u_src, v_uv      - dy).rgb * 2.0 +
    texture(u_src, v_uv + dx - dy).rgb * 1.0 +
    texture(u_src, v_uv - dx     ).rgb * 2.0 +
    texture(u_src, v_uv          ).rgb * 4.0 +
    texture(u_src, v_uv + dx     ).rgb * 2.0 +
    texture(u_src, v_uv - dx + dy).rgb * 1.0 +
    texture(u_src, v_uv      + dy).rgb * 2.0 +
    texture(u_src, v_uv + dx + dy).rgb * 1.0;

  fragColor = vec4(col * 0.0625, 1.0);
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

  // Bloom from separable Gaussian chain (H+V × 2 cycles at half-res).
  vec3 bloom = texture(u_bloom, v_uv).rgb;

  vec3 col = base + bloom * 1.5;

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
