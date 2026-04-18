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

out vec2 v_local;   // -QUAD_EXPAND..+QUAD_EXPAND; edge of circle at ±1
out vec4 v_color;
out float v_glow;

void main() {
  const float EXPAND = ${QUAD_EXPAND.toFixed(1)};
  v_local = a_quad * EXPAND;
  v_color = a_color;
  v_glow = a_glow;

  vec2 world = a_pos + a_quad * a_radius * EXPAND;
  vec2 screen = world - u_camera + u_viewport * 0.5;
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
// uses an SDF capsule so the ends are rounded and AA is free.

export const BEAM_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 a_quad;

layout(location=1) in vec2 a_p0;
layout(location=2) in vec2 a_p1;
layout(location=3) in float a_thickness;
layout(location=4) in vec4 a_color;
layout(location=5) in float a_glow;

uniform vec2 u_viewport;
uniform vec2 u_camera;

out vec2 v_world;
out vec2 v_p0;
out vec2 v_p1;
out float v_thickness;
out vec4 v_color;
out float v_glow;

void main() {
  float pad = 8.0 + a_thickness * 2.5;

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

  vec2 screen = world - u_camera + u_viewport * 0.5;
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

out vec4 fragColor;

// Signed distance from point p to segment (a, b).
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * t);
}

void main() {
  float dist = sdSegment(v_world, v_p0, v_p1);
  float r = v_thickness * 0.5;

  // Inside the capsule: full intensity; outside: exponential glow falloff
  float core = 1.0 - smoothstep(r - 1.0, r + 1.0, dist);
  float glow = exp(-max(dist - r, 0.0) * 0.18) * v_glow;

  vec3 col = v_color.rgb * (core + glow);
  float alpha = max(core * v_color.a, glow * 0.55);
  fragColor = vec4(col * alpha, alpha);
}
`;

// ─── Full-screen composite ───────────────────────────────────────────────
// Samples the HDR framebuffer at the base mip for color, and at higher mips
// (produced by generateMipmap) for cheap multi-scale bloom. Applies chromatic
// aberration, vignette, and a Reinhard tonemap.

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

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 dir = v_uv - 0.5;

  // Radial chromatic aberration — stronger toward the edges
  float aberr = 0.002 + length(dir) * 0.005;

  vec3 base;
  base.r = textureLod(u_scene, v_uv + dir * aberr, 0.0).r;
  base.g = textureLod(u_scene, v_uv, 0.0).g;
  base.b = textureLod(u_scene, v_uv - dir * aberr, 0.0).b;

  // Three-tap mip-based bloom
  vec3 bloom =
      textureLod(u_scene, v_uv, 2.0).rgb * 0.30
    + textureLod(u_scene, v_uv, 4.0).rgb * 0.40
    + textureLod(u_scene, v_uv, 6.0).rgb * 0.30;

  vec3 col = base + bloom * 0.75;

  // Subtle vignette
  col *= 1.0 - length(dir) * 0.55;

  // Reinhard tonemap + gamma
  col = col / (1.0 + col);
  col = pow(col, vec3(1.0 / 2.2));

  fragColor = vec4(col, 1.0);
}
`;
