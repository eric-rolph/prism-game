// GLSL 300 ES shaders for Prism's SOTA optical WebGL2 pipeline:
//   1. Deep-space starfield + Fresnel sapphire crystal globe + fine anti-aliased grid + caustics
//   2. Instanced faceted geometric SDF shapes (orbs, diamonds, crystal hexes, chevrons, hollow wave rings, spinning prism, stars)
//   3. Instanced optical plasma beams with spectral fringe, photon ripple, and emitter/impact flares
//   4. 4-level Dual Kawase HDR bloom pyramid (soft-knee prefilter + 5-tap down + 8-tap tent up)
//   5. ACES Filmic tone mapping + temporal persistence + dynamic combat flashes & low-HP vignette

// ─── 1. SDF Faceted Geometry (Circles, Crystals, Rings, Prisms, Stars) ───

export const CIRCLE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2  a_quad;
layout(location = 1) in vec2  a_center;
layout(location = 2) in float a_radius;
layout(location = 3) in vec4  a_color;
layout(location = 4) in float a_glow;
layout(location = 5) in float a_shape;

uniform vec2  u_resolution;
uniform vec2  u_camera;
uniform vec2  u_shake;
uniform float u_arena_radius;

out vec2  v_uv;
out vec4  v_color;
out float v_glow;
out float v_shape;
out float v_seed;
out float v_radius;

vec2 projectGlobe(vec2 rel) {
  float d = length(rel);
  float theta = d / max(u_arena_radius, 1.0);
  if (theta < 0.0001) return rel;
  return rel * (sin(theta) / theta);
}

void main() {
  vec2 rel = a_center - u_camera;
  float dist = length(rel);
  float horizon = u_arena_radius * 1.5707963;
  if (dist > horizon) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec2 proj = projectGlobe(rel);
  float theta = dist / max(u_arena_radius, 1.0);
  float foreshorten = max(cos(theta), 0.14);

  // Rings need minimal extra padding; soft/glowing shapes get wider halo headroom.
  float pad = (a_shape > 3.5 && a_shape < 4.5) ? 1.35 : 2.35;
  float scaledR = a_radius * pad * sqrt(foreshorten);

  vec2 world = proj + a_quad * scaledR;
  vec2 ndc = (world + u_shake) / (u_resolution * 0.5);
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  v_uv     = a_quad * pad;
  v_color  = a_color;
  v_glow   = a_glow;
  v_shape  = a_shape;
  v_seed   = fract(sin(dot(a_center * 0.013, vec2(12.9898, 78.233))) * 43758.5453);
  v_radius = a_radius;
}
`;

export const CIRCLE_FRAG = `#version 300 es
precision highp float;

in vec2  v_uv;
in vec4  v_color;
in float v_glow;
in float v_shape;
in float v_seed;
in float v_radius;

uniform float u_time;

out vec4 fragColor;

mat2 rot2(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

// Inigo Quilez exact 2D SDFs.
float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

float sdDiamond(vec2 p, float r) {
  vec2 q = abs(p);
  return (q.x * 1.18 + q.y * 0.88 - r) * 0.72;
}

float sdTriangle(vec2 p, float r) {
  const float k = 1.732050808;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float sdStar8(vec2 p, float r) {
  float d1 = sdDiamond(p, r);
  float d2 = sdDiamond(rot2(0.78539816) * p, r);
  return min(d1, d2);
}

vec3 spectrum(float t) {
  return 0.52 + 0.48 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  int shape = int(v_shape + 0.5);
  float d = length(v_uv);
  float aa = max(fwidth(d), 0.035);

  vec3 col = v_color.rgb;
  float alpha = 0.0;
  float glowBoost = 1.0 + v_glow * 0.65;

  if (shape == 0) {
    // Pure silky radial glow for ambient auras (zero hard circular disc edge!),
    // with a crisp hot center only for high-alpha particles.
    float softAura = exp(-d * d * 2.65);
    float crispDot = (1.0 - smoothstep(0.65 - aa, 0.72 + aa, d)) * smoothstep(0.45, 0.85, v_color.a);
    float halo = softAura * (0.55 + v_glow * 0.26);
    alpha = (crispDot + halo) * v_color.a;
    col = mix(v_color.rgb, v_color.rgb * 1.25 + vec3(0.18), crispDot * 0.5);
  } else if (shape == 1) {
    // Rotating faceted crystal diamond (XP radiance gems, halos, shard nodes).
    float spin = u_time * 1.85 + v_seed * 6.2831;
    vec2 p = rot2(spin) * v_uv;
    float sd = sdDiamond(p, 0.88);
    float fill = 1.0 - smoothstep(-aa, aa, sd);
    float rim  = exp(-abs(sd) * 14.0);
    float halo = exp(-max(sd, 0.0) * 3.8) * v_glow * 0.34;
    // Internal specular crystal facets across quadrants.
    float facet = 0.72 + 0.28 * sign(p.x * p.y) * 0.5 + 0.35 * exp(-abs(p.x) * 8.0) + 0.25 * exp(-abs(p.y) * 8.0);
    vec3 prismRim = mix(v_color.rgb, vec3(1.0), 0.55) + spectrum(v_seed + u_time * 0.35) * 0.18;
    vec3 bodyCol = v_color.rgb * facet * (1.1 + v_glow * 0.38) + prismRim * rim * 0.95;
    col = bodyCol * fill + v_color.rgb * halo * 1.35;
    alpha = clamp(fill + rim * 0.45 + halo, 0.0, 1.5) * v_color.a;
  } else if (shape == 2) {
    // Beveled crystalline hexagon (crystal obstacles, shields, mines, brutes).
    float spin = u_time * 0.45 + v_seed * 6.2831;
    vec2 p = rot2(spin) * v_uv;
    float sd = sdHexagon(p, 0.78);
    float fill = 1.0 - smoothstep(-aa, aa, sd);
    float rim  = exp(-abs(sd) * 15.0);
    float innerBevel = exp(-abs(sd + 0.22) * 18.0) * fill;
    float halo = exp(-max(sd, 0.0) * 3.6) * v_glow * 0.32;
    float facetShade = 0.78 + 0.22 * cos(atan(p.y, p.x) * 3.0 + spin);
    vec3 rimCol = mix(v_color.rgb, vec3(0.85, 0.97, 1.0), 0.55);
    col = (v_color.rgb * facetShade * (0.95 + v_glow * 0.30) + rimCol * (rim * 1.15 + innerBevel * 0.45)) * fill
        + rimCol * rim * 0.55
        + v_color.rgb * halo * 1.25;
    alpha = clamp(fill + rim * 0.55 + halo, 0.0, 1.5) * v_color.a;
  } else if (shape == 3) {
    // Razor geometric chevron / triangle shard (drones, dashers, umbra).
    float spin = u_time * 1.45 + v_seed * 6.2831;
    vec2 p = rot2(spin) * v_uv;
    float sd = sdTriangle(p, 0.78);
    float fill = 1.0 - smoothstep(-aa, aa, sd);
    float rim  = exp(-abs(sd) * 16.0);
    float halo = exp(-max(sd, 0.0) * 4.2) * v_glow * 0.30;
    float spine = exp(-abs(p.x) * 10.0) * fill * 0.38;
    vec3 hot = mix(v_color.rgb, vec3(1.0, 0.96, 0.92), 0.55);
    col = (v_color.rgb * (1.0 + v_glow * 0.32) + hot * (rim * 0.95 + spine)) * fill
        + hot * rim * 0.40
        + v_color.rgb * halo;
    alpha = clamp(fill + rim * 0.40 + halo, 0.0, 1.4) * v_color.a;
  } else if (shape == 4) {
    // Hollow optical wave ring with subtle chromatic dispersion (pulses, barrier, shockwaves).
    float radiusNorm = 0.90;
    float ringW = clamp(0.055 + 1.8 / max(v_radius, 14.0), 0.035, 0.14);
    float disp = ringW * 0.42;
    float rOut = exp(-pow((d - (radiusNorm + disp)) / ringW, 2.0));
    float gMid = exp(-pow((d - radiusNorm) / ringW, 2.0));
    float bIn  = exp(-pow((d - (radiusNorm - disp)) / ringW, 2.0));
    float coreRing = exp(-pow((d - radiusNorm) / (ringW * 0.45), 2.0));
    float interior = (1.0 - smoothstep(0.0, radiusNorm, d)) * smoothstep(radiusNorm * 0.55, radiusNorm, d) * 0.14;
    vec3 chroma = vec3(
      v_color.r * (0.72 * rOut + 0.38 * gMid),
      v_color.g * gMid,
      v_color.b * (0.72 * bIn + 0.38 * gMid)
    );
    col = chroma * (1.25 + v_glow * 0.55) + vec3(1.0) * coreRing * 0.45 + v_color.rgb * interior;
    alpha = clamp(max(max(rOut, gMid), bIn) + coreRing * 0.35 + interior, 0.0, 1.4) * v_color.a;
  } else if (shape == 5) {
    // Spinning faceted prismatic crystal core (Player Prism & Void Prism).
    // Preserves crisp crystalline facets & rainbow Fresnel edges instead of clipping to white.
    float spin = u_time * 0.95;
    vec2 p = rot2(spin) * v_uv;
    float sdHex = sdHexagon(p, 0.86);
    float sdTri = sdTriangle(rot2(-spin * 1.8) * v_uv, 0.56);
    float fill = 1.0 - smoothstep(-aa, aa, sdHex);
    float outerRim = exp(-abs(sdHex) * 18.0);
    float innerPrism = exp(-abs(sdTri) * 20.0) * fill;
    float halo = exp(-max(sdHex, 0.0) * 3.4) * (0.28 + min(v_glow, 2.2) * 0.14);

    // Spectral rainbow dispersion curving around the prism facets.
    float ang = atan(p.y, p.x);
    vec3 rainbow = spectrum(ang / 6.2831853 + u_time * 0.25);
    float facetShade = 0.55 + 0.45 * cos(ang * 3.0);
    float facetLines = exp(-abs(sin(ang * 3.0)) * 12.0) * fill * 0.48;
    float coreStar = exp(-d * d * 18.0);

    vec3 glassInterior = mix(v_color.rgb * 0.34, v_color.rgb * 0.68, facetShade);
    vec3 body = glassInterior
              + rainbow * (outerRim * 1.25 + facetLines * 0.95 + innerPrism * 0.90)
              + vec3(0.95, 1.0, 1.0) * (coreStar * 0.85 + outerRim * 0.45 + innerPrism * 0.35);
    col = body * fill + mix(v_color.rgb, rainbow, 0.68) * (outerRim * 0.60 + halo);
    alpha = clamp(fill + outerRim * 0.55 + halo, 0.0, 1.35) * v_color.a;
  } else {
    // Shape 6: Radiant crystalline 8-point starburst (Sentinel, Orbiters, Pulsars, Mini-Bosses).
    float spin = u_time * 1.15 + v_seed * 6.2831;
    vec2 p = rot2(spin) * v_uv;
    float sd = sdStar8(p, 0.84);
    float fill = 1.0 - smoothstep(-aa, aa, sd);
    float rim  = exp(-abs(sd) * 14.0);
    float halo = exp(-max(sd, 0.0) * 3.2) * v_glow * 0.36;
    float core = exp(-d * d * 7.5);
    vec3 rimCol = mix(v_color.rgb, vec3(1.0, 0.96, 0.88), 0.6);
    col = (v_color.rgb * (1.0 + v_glow * 0.35) + rimCol * (rim * 1.0 + core * 0.75)) * fill
        + rimCol * rim * 0.45
        + v_color.rgb * halo * 1.3;
    alpha = clamp(fill + rim * 0.45 + halo, 0.0, 1.5) * v_color.a;
  }

  if (alpha < 0.002) discard;
  fragColor = vec4(col * alpha, alpha);
}
`;

// ─── 2. Optical Plasma Beams (SDF Capsules with Spectral Fringe & Tip Flares) ───

export const BEAM_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2  a_quad;
layout(location = 1) in vec2  a_p0;
layout(location = 2) in vec2  a_p1;
layout(location = 3) in float a_thickness;
layout(location = 4) in vec4  a_color;
layout(location = 5) in float a_glow;
layout(location = 6) in float a_form_progress;

uniform vec2  u_resolution;
uniform vec2  u_camera;
uniform vec2  u_shake;
uniform float u_arena_radius;

out vec2  v_uv;
out float v_len;
out float v_thickness;
out vec4  v_color;
out float v_glow;
out float v_form_progress;
out vec2  v_p0_proj;
out float v_pad;

vec2 projectGlobe(vec2 rel) {
  float d = length(rel);
  float theta = d / max(u_arena_radius, 1.0);
  if (theta < 0.0001) return rel;
  return rel * (sin(theta) / theta);
}

void main() {
  vec2 r0 = a_p0 - u_camera;
  vec2 r1 = a_p1 - u_camera;
  float horizon = u_arena_radius * 1.5707963;
  if (length(r0) > horizon && length(r1) > horizon) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec2 p0 = projectGlobe(r0);
  vec2 p1 = projectGlobe(r1);
  vec2 delta = p1 - p0;
  float len = length(delta);
  vec2 dir = len > 0.0001 ? delta / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float pad = a_thickness * 5.2 + 16.0;
  float along = (a_quad.x * 0.5 + 0.5) * len + a_quad.x * pad;
  float side  = a_quad.y * pad;

  vec2 world = p0 + dir * along + perp * side;
  vec2 ndc = (world + u_shake) / (u_resolution * 0.5);
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  v_uv            = vec2(along, side);
  v_len           = len;
  v_thickness     = a_thickness;
  v_color         = a_color;
  v_glow          = a_glow;
  v_form_progress = a_form_progress;
  v_p0_proj       = p0;
  v_pad           = pad;
}
`;

export const BEAM_FRAG = `#version 300 es
precision highp float;

in vec2  v_uv;
in float v_len;
in float v_thickness;
in vec4  v_color;
in float v_glow;
in float v_form_progress;
in vec2  v_p0_proj;
in float v_pad;

uniform float u_time;
uniform float u_beam_density; // auto-attenuates per-beam energy when 100s of beams overlap

out vec4 fragColor;

void main() {
  float effectiveLen = max(v_len * clamp(v_form_progress, 0.05, 1.0), 0.5);
  float clampedX = clamp(v_uv.x, 0.0, effectiveLen);
  vec2 nearest = vec2(clampedX, 0.0);
  float dist = length(v_uv - nearest);
  float r = max(v_thickness * 0.5, 0.6);

  // Seamless radial feather mask guarantees zero rectangular quad clipping at beam tips.
  float edgeFeather = 1.0 - smoothstep(v_pad * 0.52, v_pad * 0.96, dist);
  if (edgeFeather <= 0.001) discard;

  float t = clamp(v_uv.x / max(effectiveLen, 1.0), 0.0, 1.0);

  // Tight vibrant optical core + controlled halo (tinted instead of flat white washout!).
  float core = exp(-pow(dist / (r * 0.72), 2.0) * 2.2);
  float midGlow = exp(-dist / (r * 1.55 + 1.8));
  float wideGlow = exp(-dist / (r * 3.0 + 3.6)) * 0.24;

  // Travelling photon interference pulse along the light ray.
  float phase = dot(v_p0_proj, vec2(0.017, 0.023));
  float ripple = 0.84 + 0.16 * sin(v_uv.x * 0.14 - u_time * 34.0 + phase);
  float shimmer = 0.90 + 0.10 * cos(v_uv.x * 0.06 + u_time * 18.0);

  // Rich lateral spectral dispersion fringe (vivid RGB chromatic prism separation).
  float sideNorm = v_uv.y / max(r * 2.2, 1.0);
  vec3 fringe = vec3(
    smoothstep(-0.1, 1.3, sideNorm),
    1.0 - abs(sideNorm) * 0.6,
    smoothstep(-0.1, 1.3, -sideNorm)
  );
  vec3 dispersed = mix(v_color.rgb, v_color.rgb * 0.52 + fringe * 0.72, 0.58 * midGlow);

  // Emitter origin flare & impact tip flare.
  float originFlare = exp(-length(v_uv) / (r * 2.1 + 3.0)) * 0.48;
  float tipFlare    = exp(-length(v_uv - vec2(effectiveLen, 0.0)) / (r * 2.4 + 3.5)) * 0.65;
  float endFade     = smoothstep(0.0, 0.03, t) * (0.74 + 0.26 * (1.0 - t));

  // Keep beam cores richly tinted with their shard hue instead of blowing out to pure white!
  vec3 coreTint = mix(v_color.rgb, vec3(1.0), 0.36 * u_beam_density);
  float energy = ((core * 1.25 + midGlow * 0.62 + wideGlow) * ripple * shimmer * (0.82 + 0.18 * endFade)
               + originFlare + tipFlare) * edgeFeather;

  vec3 col = (dispersed * (0.85 + min(v_glow, 3.0) * 0.28) * (midGlow * 0.85 + wideGlow + originFlare * 0.6 + tipFlare * 0.75)
           + coreTint * (core * (0.95 + min(v_glow, 2.5) * 0.24) + tipFlare * 0.35)) * edgeFeather * u_beam_density;

  float alpha = clamp(energy * u_beam_density, 0.0, 1.2) * v_color.a;
  if (alpha < 0.002) discard;

  fragColor = vec4(col * v_color.a, alpha);
}
`;

// ─── 3. Deep-Space Starfield + Sapphire Crystal Globe + Caustics ────────

export const GRID_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
}
`;

export const GRID_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec2  u_resolution;
uniform vec2  u_camera;
uniform vec2  u_shake;
uniform float u_arena_radius;
uniform float u_time;
uniform float u_intensity;
uniform float u_boss_mood;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Smooth dual-layer optical caustics on sphere normal.
float causticWave(vec3 n, float t) {
  float a = sin(n.x * 13.0 + n.y * 9.0 + t * 0.9) * cos(n.z * 11.0 - n.x * 7.0 - t * 0.7);
  float b = sin(n.y * 17.0 - n.z * 12.0 + t * 1.15) * cos(n.x * 14.0 + n.y * 10.0 + t * 0.6);
  float c = abs(a + b) * 0.5;
  return pow(clamp(1.0 - c, 0.0, 1.0), 3.6);
}

void main() {
  vec2 screen = (v_uv - 0.5) * u_resolution;
  screen.y = -screen.y;
  vec2 p = screen - u_shake;

  float R = max(u_arena_radius, 1.0);
  vec2 q = p / R;
  float r2 = dot(q, q);
  float r = sqrt(r2);

  // Deep space backdrop outside the globe limb (starfield + faint prismatic aurora).
  if (r2 >= 1.0) {
    vec3 space = vec3(0.004, 0.007, 0.018);

    // Subtle cosmic nebula wash.
    float neb = 0.5 + 0.5 * sin(v_uv.x * 4.5 + v_uv.y * 2.8 + u_time * 0.08);
    space += mix(vec3(0.008, 0.022, 0.048), vec3(0.024, 0.010, 0.042), neb) * 0.65;

    // Crisp multi-layer procedural starfield.
    for (int layer = 0; layer < 2; layer++) {
      float scale = (layer == 0) ? 95.0 : 175.0;
      vec2 sp = (screen + u_camera * (layer == 0 ? 0.02 : 0.04)) / scale;
      vec2 cell = floor(sp);
      vec2 f = fract(sp) - 0.5;
      float rnd = hash21(cell + float(layer) * 31.7);
      if (rnd > 0.87) {
        vec2 jitter = vec2(hash21(cell + 7.1), hash21(cell + 19.3)) - 0.5;
        float starD = length(f - jitter * 0.55);
        float twinkle = 0.65 + 0.35 * sin(u_time * (2.2 + rnd * 4.0) + rnd * 40.0);
        float star = exp(-starD * starD * 190.0) * twinkle * (layer == 0 ? 0.95 : 0.60);
        vec3 starCol = mix(vec3(0.65, 0.88, 1.0), vec3(1.0, 0.90, 0.72), fract(rnd * 17.0));
        space += starCol * star;
      }
    }

    // Outer atmospheric Fresnel corona hugging the curved sphere limb!
    float outerDist = r - 1.0;
    float corona = exp(-outerDist * 14.0) * 0.52 + exp(-outerDist * 4.5) * 0.14;
    vec3 coronaCol = mix(vec3(0.18, 0.76, 1.0), vec3(0.75, 0.32, 1.0), u_boss_mood * 0.65 + 0.18 * sin(u_time * 0.4));
    space += coronaCol * corona * (0.85 + 0.35 * u_intensity);

    fragColor = vec4(space, 1.0);
    return;
  }

  // Exact orthographic inverse projection onto the unit sphere centered on u_camera.
  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 localN = vec3(q.x, q.y, z);

  float camLon = u_camera.x / R;
  float camLat = u_camera.y / R;
  float sLon = sin(camLon), cLon = cos(camLon);
  float sLat = sin(camLat), cLat = cos(camLat);

  vec3 camNormal = vec3(sLon * cLat, sLat, cLon * cLat);
  vec3 camEast   = vec3(cLon, 0.0, -sLon);
  vec3 camNorth  = vec3(-sLon * sLat, cLat, -cLon * sLat);

  vec3 worldN = normalize(camEast * localN.x + camNorth * localN.y + camNormal * localN.z);

  float lat = asin(clamp(worldN.y, -1.0, 1.0));
  float lon = atan(worldN.x, worldN.z);

  // Jewel-like obsidian-sapphire crystal glass base with physical Fresnel limb depth.
  float fresnel = pow(1.0 - z, 2.8);
  vec3 centerTint = mix(vec3(0.011, 0.020, 0.044), vec3(0.026, 0.012, 0.046), u_boss_mood * 0.65);
  vec3 limbTint   = mix(vec3(0.045, 0.145, 0.245), vec3(0.165, 0.055, 0.240), u_boss_mood * 0.65);
  vec3 col = mix(centerTint, limbTint, fresnel);

  // Crisp anti-aliased meridian & parallel optical coordinate lines (15° minor, 45° major).
  float lonStep = 3.14159265 / 12.0; // 15°
  float latStep = 3.14159265 / 12.0;

  float lonCoord = lon / lonStep;
  float latCoord = lat / latStep;

  float dLon = abs(fract(lonCoord + 0.5) - 0.5) / max(fwidth(lonCoord), 0.002);
  float dLat = abs(fract(latCoord + 0.5) - 0.5) / max(fwidth(latCoord), 0.002);

  // Fade meridian crowding cleanly near the poles.
  float polarFade = smoothstep(0.08, 0.35, cos(lat));
  float minorLon = (1.0 - smoothstep(0.0, 1.35, dLon)) * polarFade;
  float minorLat = 1.0 - smoothstep(0.0, 1.35, dLat);

  float dLonMaj = abs(fract(lonCoord / 3.0 + 0.5) - 0.5) * 3.0 / max(fwidth(lonCoord), 0.002);
  float dLatMaj = abs(fract(latCoord / 3.0 + 0.5) - 0.5) * 3.0 / max(fwidth(latCoord), 0.002);
  float majorLon = (1.0 - smoothstep(0.0, 1.65, dLonMaj)) * polarFade;
  float majorLat = 1.0 - smoothstep(0.0, 1.65, dLatMaj);

  // Subtle glowing micro-beacons at grid intersections.
  float node = minorLon * minorLat;
  float majorNode = majorLon * majorLat;

  vec3 gridCol = mix(vec3(0.14, 0.56, 0.86), vec3(0.62, 0.30, 0.95), u_boss_mood * 0.55);
  float gridVis = (0.35 + 0.65 * z);
  col += gridCol * (minorLon + minorLat) * 0.085 * gridVis;
  col += mix(gridCol, vec3(0.62, 0.94, 1.0), 0.45) * (majorLon + majorLat) * 0.135 * gridVis;
  col += vec3(0.55, 0.92, 1.0) * (node * 0.16 + majorNode * 0.34) * gridVis;

  // Dual-wave prismatic refractive caustics flowing across the glass globe.
  float c1 = causticWave(worldN, u_time * 0.72);
  float c2 = causticWave(worldN * 1.35 + vec3(0.7, -0.4, 0.3), -u_time * 0.55);
  vec3 causticCol = mix(vec3(0.10, 0.48, 0.78), vec3(0.45, 0.24, 0.85), c2);
  col += causticCol * (c1 * 0.075 + c2 * 0.055) * (0.75 + u_intensity * 0.95) * (0.4 + 0.6 * z);

  // Glowing polar vortex rings at |lat| > 1.0 rad (~57°).
  float absLat = abs(lat);
  float polarZone = smoothstep(0.95, 1.38, absLat);
  if (polarZone > 0.001) {
    float polarRings = 0.5 + 0.5 * sin(absLat * 26.0 - u_time * 2.8);
    col += vec3(0.32, 0.88, 1.0) * polarZone * (0.14 + 0.16 * polarRings);
  }

  // Sharp inner iridescent limb edge highlight.
  float rimGlow = smoothstep(0.86, 1.0, r) * (1.0 - smoothstep(0.992, 1.001, r));
  vec3 rimTint = mix(vec3(0.35, 0.88, 1.0), vec3(0.86, 0.42, 1.0), u_boss_mood * 0.65);
  col += rimTint * rimGlow * (0.58 + 0.25 * u_intensity);

  fragColor = vec4(col, 1.0);
}
`;

// ─── 4. Dual Kawase Bloom Pyramid (Prefilter + 5-Tap Down + 8-Tap Up) ───

export const FULLSCREEN_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
}
`;

// Soft-knee luminance threshold prefilter + initial 4-tap box downsample.
export const BLOOM_PREFILTER_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;

out vec4 fragColor;

vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  const float threshold = 0.58;
  const float knee = 0.42;
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 0.00001);
  float contrib = max(soft, br - threshold) / max(br, 0.0001);
  return c * max(contrib, 0.0);
}

void main() {
  vec2 h = u_texel * 0.5;
  vec3 c = (
    prefilter(texture(u_tex, v_uv + vec2(-h.x, -h.y)).rgb) +
    prefilter(texture(u_tex, v_uv + vec2( h.x, -h.y)).rgb) +
    prefilter(texture(u_tex, v_uv + vec2(-h.x,  h.y)).rgb) +
    prefilter(texture(u_tex, v_uv + vec2( h.x,  h.y)).rgb)
  ) * 0.25;
  fragColor = vec4(c, 1.0);
}
`;

// Dual Kawase 5-tap downsample (center*4 + 4 half-pixel diagonals).
export const KAWASE_DOWN_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;

out vec4 fragColor;

void main() {
  vec2 o = u_texel * 1.0;
  vec3 sum = texture(u_tex, v_uv).rgb * 4.0;
  sum += texture(u_tex, v_uv - o).rgb;
  sum += texture(u_tex, v_uv + o).rgb;
  sum += texture(u_tex, v_uv + vec2(o.x, -o.y)).rgb;
  sum += texture(u_tex, v_uv - vec2(o.x, -o.y)).rgb;
  fragColor = vec4(sum * 0.125, 1.0);
}
`;

// Dual Kawase 8-tap tent upsample (weights: 4 cardinals * 1 + 4 diagonals * 2, / 12).
export const KAWASE_UP_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_weight;

out vec4 fragColor;

void main() {
  vec2 o = u_texel * 1.0;
  vec3 sum = vec3(0.0);
  sum += texture(u_tex, v_uv + vec2(-o.x * 2.0, 0.0)).rgb;
  sum += texture(u_tex, v_uv + vec2(-o.x,  o.y)).rgb * 2.0;
  sum += texture(u_tex, v_uv + vec2(0.0,   o.y * 2.0)).rgb;
  sum += texture(u_tex, v_uv + vec2( o.x,  o.y)).rgb * 2.0;
  sum += texture(u_tex, v_uv + vec2( o.x * 2.0, 0.0)).rgb;
  sum += texture(u_tex, v_uv + vec2( o.x, -o.y)).rgb * 2.0;
  sum += texture(u_tex, v_uv + vec2(0.0,  -o.y * 2.0)).rgb;
  sum += texture(u_tex, v_uv + vec2(-o.x, -o.y)).rgb * 2.0;
  fragColor = vec4((sum / 12.0) * u_weight, 1.0);
}
`;

// ─── 5. Final Composite (ACES Filmic + Persistence + Combat Flashes) ───

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_prev;
uniform float u_time;
uniform float u_intensity;
uniform float u_bloom_scale;
uniform float u_screen_flash;
uniform float u_damage_flash;
uniform float u_low_hp;

out vec4 fragColor;

// Spectral thin-film interference color curve (oil-on-water / laser interferometry palette).
vec3 thinFilmSpectrum(float phase) {
  return 0.52 + 0.48 * cos(6.2831853 * (phase + vec3(0.00, 0.31, 0.64)));
}

// Chroma-Preserving Optical Tone Mapping + Thin-Film Interference at Extreme Photon Overlap!
// Prevents late-game 1,000+ overlapping beam storms from collapsing into a blinding flat white blob:
// instead, dense photon intersections refract into iridescent jewel filaments & stained-glass interference!
vec3 opticalPrismTonemap(vec3 hdr, vec2 uv, float t) {
  float peak = max(hdr.r, max(hdr.g, hdr.b));
  if (peak < 0.0001) return vec3(0.0);

  // Extract normalized chromaticity (hue + saturation) BEFORE compressing luminance.
  vec3 chroma = hdr / peak;
  // Slightly deepen saturation so overlapping pastels stay jewel-rich.
  float luma = dot(chroma, vec3(0.2126, 0.7152, 0.0722));
  vec3 richChroma = clamp(mix(vec3(luma), chroma, 1.28), 0.0, 1.0);

  // Logarithmic optical compression keeps late-game peak energy readable instead of clipping to 1.0 white.
  float compressed = peak / (1.0 + peak * 0.62);
  float softKnee = 1.0 - exp(-peak * 1.15);
  float finalLuma = mix(compressed, softKnee, 0.45);

  vec3 baseMapped = richChroma * finalLuma;

  // Optical Thin-Film Spectral Interference when intense beams pile up (peak > 1.35):
  // Channels excess photon density into animated iridescent diffraction fringes instead of whiteout!
  float excess = max(0.0, peak - 1.35);
  if (excess > 0.001) {
    float density = log(1.0 + excess);
    float ripple = sin(uv.x * 16.0 - uv.y * 12.0 + t * 2.4 + density * 2.8) * 0.14;
    vec3 film = thinFilmSpectrum(density * 0.58 + ripple + dot(chroma, vec3(0.3, 0.5, 0.7)));
    float blend = clamp(density * 0.36, 0.0, 0.68);
    // Keep narrow incandescent core filaments while infusing surrounding overlap with prismatic color!
    vec3 interferometric = mix(baseMapped, film * (0.76 + 0.24 * clamp(density * 0.3, 0.0, 1.0)), blend);
    return mix(interferometric, vec3(1.0, 0.99, 1.0), smoothstep(4.5, 22.0, excess) * 0.22);
  }
  return baseMapped;
}

void main() {
  vec2 centered = v_uv - 0.5;
  float r2 = dot(centered, centered);

  // Radial spectral chromatic aberration — subtle during calm, kicks on intense builds / hits.
  float caAmt = (0.0008 + u_intensity * 0.0024 + u_damage_flash * 0.0055) * u_bloom_scale;
  vec2 caDir = centered * caAmt * (0.4 + r2 * 2.4);

  vec3 scene = vec3(
    texture(u_scene, v_uv + caDir).r,
    texture(u_scene, v_uv).g,
    texture(u_scene, v_uv - caDir).b
  );

  // Multi-octave Dual Kawase bloom — capped smoothly so late-game storms stay crisp & colorful!
  vec3 rawBloom = texture(u_bloom, v_uv).rgb;
  // Soft-compress bloom energy BEFORE adding so bloom never washes out the whole screen in white.
  float bloomPeak = max(rawBloom.r, max(rawBloom.g, rawBloom.b));
  vec3 bloom = rawBloom / (1.0 + bloomPeak * 0.55);
  float bloomGain = (0.46 + 0.28 * log(1.0 + u_intensity * 1.8)) * u_bloom_scale;

  // Temporal light persistence (silky laser afterglow without milky fog).
  vec3 prev = texture(u_prev, v_uv).rgb;
  float prevPeak = max(prev.r, max(prev.g, prev.b));
  vec3 prevSafe = prev / (1.0 + prevPeak * 0.85);
  float persist = (0.11 + u_intensity * 0.04) * clamp(u_bloom_scale, 0.35, 1.0);

  vec3 hdr = scene + bloom * bloomGain + prevSafe * persist;

  // Prismatic milestone / level-up / shield-break flash.
  if (u_screen_flash > 0.001) {
    float radialFlash = smoothstep(0.95, 0.05, sqrt(r2));
    hdr += vec3(0.32, 0.82, 1.0) * u_screen_flash * (0.12 + 0.18 * radialFlash);
  }

  // Damage flash & low-HP heartbeat crimson vignette.
  float edge = smoothstep(0.18, 0.72, sqrt(r2));
  if (u_damage_flash > 0.001) {
    hdr += vec3(1.15, 0.14, 0.18) * u_damage_flash * edge * 0.55;
  }
  if (u_low_hp > 0.001) {
    float heartbeat = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(u_time * 5.2), 2.0);
    hdr += vec3(0.95, 0.08, 0.14) * u_low_hp * heartbeat * edge * 0.42;
  }

  // Subtle theatrical vignette framing the spherical arena.
  float vig = 1.0 - r2 * 0.46;
  hdr *= clamp(vig, 0.48, 1.0);

  // Chroma-Preserving Optical Interference Tonemap + crisp sRGB gamma.
  vec3 mapped = opticalPrismTonemap(hdr * 1.05, v_uv, u_time);
  vec3 srgb = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));

  fragColor = vec4(srgb, 1.0);
}
`;

export const COPY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;

out vec4 fragColor;

void main() {
  fragColor = texture(u_tex, v_uv);
}
`;
