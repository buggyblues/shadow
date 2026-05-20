// ══════════════════════════════════════════════════════════════
// WGSL Shaders — WebGPU Edition
//
// Faithful translation of the WebGL Balatro shaders to WGSL.
// Architecture:
//   - No per-draw uniforms: all instance data in a storage buffer.
//   - Instanced rendering: vertex_index drives quad gen, instance_index
//     drives per-card data lookup.
//   - Texture array: all card content textures in one GPUTexture.
//
// Bind groups:
//   @group(0) @binding(0)  — Global UBO  (viewport, time)
//   @group(0) @binding(1)  — Instance Storage Buffer
//   @group(1) @binding(0)  — Texture2DArray (card content)
//   @group(1) @binding(1)  — Sampler
// ══════════════════════════════════════════════════════════════

// ── Instance stride (bytes) ──
// 112 bytes = 28 × f32.  Layout verified against WGSL alignment rules.
export const INSTANCE_STRIDE_FLOATS = 28
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4

// ── Float offsets inside one instance ──
export const I_TRANSLATE_X = 0
export const I_TRANSLATE_Y = 1
export const I_ANGLE = 2
// I_P0                      = 3  (padding)
export const I_SIZE_W = 4
export const I_SIZE_H = 5
export const I_RADIUS = 6
export const I_TEX_IDX = 7
export const I_HOVER = 8
export const I_ACTIVE = 9
export const I_STREAMING = 10
export const I_SELECTED = 11
export const I_FLIP_ANGLE = 12
export const I_FLIP_PROGRESS = 13
export const I_MOUSE_X = 14
export const I_MOUSE_Y = 15
export const I_TILT_STRENGTH = 16
export const I_HIDDEN = 17
export const I_KIND_INDEX = 18
export const I_FLASH = 19 // was _p1 padding: foil/holo gate for flash cards
export const I_TAPE_R = 20
export const I_TAPE_G = 21
export const I_TAPE_B = 22
// I_P2                      = 23 (padding)
export const I_EDGE_R = 24
export const I_EDGE_G = 25
export const I_EDGE_B = 26
// I_P3                      = 27 (padding)

// ── Global UBO float offsets ──
export const G_VIEW_OFFSET_X = 0
export const G_VIEW_OFFSET_Y = 1
export const G_VIEW_ZOOM = 2
export const G_TIME = 3
export const G_VIEW_W = 4
export const G_VIEW_H = 5
// G_PAD[2]                  = 6,7
export const GLOBAL_FLOATS = 8

// ─────────────────────────────────────────────────────────────
// WGSL shader source
// ─────────────────────────────────────────────────────────────

export const WGSL_SHADER = /* wgsl */ `

// ════════════════════════════════════
// §1 — Structs
// ════════════════════════════════════

struct Global {
  viewOffset : vec2f,   // 0
  viewZoom   : f32,     // 8
  time       : f32,     // 12
  viewW      : f32,     // 16  (physical pixels)
  viewH      : f32,     // 20
  _pad       : vec2f,   // 24
}

// 112-byte stride, 16-byte aligned.
struct InstanceData {
  translate     : vec2f,  // 0
  angle         : f32,    // 8
  _p0           : f32,    // 12
  size          : vec2f,  // 16
  radius        : f32,    // 24
  textureIndex  : f32,    // 28
  hover         : f32,    // 32
  active        : f32,    // 36
  streaming     : f32,    // 40
  selected      : f32,    // 44
  flipAngle     : f32,    // 48
  flipProgress  : f32,    // 52
  mouseLocalX   : f32,    // 56
  mouseLocalY   : f32,    // 60
  tiltStrength  : f32,    // 64
  hidden        : f32,    // 68
  kindIndex     : f32,    // 72
  flash         : f32,    // 76 — foil/holo gate (1.0 = flash card)
  tapeColor     : vec3f,  // 80
  _p2           : f32,    // 92
  edgeColor     : vec3f,  // 96
  _p3           : f32,    // 108
}

struct VertexOutput {
  @builtin(position)                  position    : vec4f,
  @location(0)                        texCoord    : vec2f,
  @location(1)                        localPos    : vec2f,
  @location(2) @interpolate(flat)     instanceIdx : u32,
}

// ════════════════════════════════════
// §2 — Bindings
// ════════════════════════════════════

@group(0) @binding(0) var<uniform>          globals   : Global;
@group(0) @binding(1) var<storage, read>    instances : array<InstanceData>;
@group(1) @binding(0) var                   contentTexArray : texture_2d_array<f32>;
@group(1) @binding(1) var                   contentSampler  : sampler;

// ════════════════════════════════════
// §3 — Math Helpers
// ════════════════════════════════════

// GLSL mod(x,y) = x - y*floor(x/y)  (differs from % for negatives)
fn fmod(x: f32, y: f32) -> f32  { return x - y * floor(x / y); }
fn fmod2(x: vec2f, y: f32) -> vec2f { return x - y * floor(x / vec2f(y)); }
fn fmod3(x: vec3f, y: f32) -> vec3f { return x - y * floor(x / vec3f(y)); }

fn roundedBoxSDF(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) - r;
}

fn ghash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn gnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(
    mix(ghash(i),             ghash(i + vec2f(1.0, 0.0)), u.x),
    mix(ghash(i + vec2f(0.0, 1.0)), ghash(i + vec2f(1.0, 1.0)), u.x),
    u.y
  );
}

fn hueToRGB(s: f32, t: f32, h: f32) -> f32 {
  let hs = fmod(h, 1.0) * 6.0;
  if (hs < 1.0) { return (t - s) * hs + s; }
  if (hs < 3.0) { return t; }
  if (hs < 4.0) { return (t - s) * (4.0 - hs) + s; }
  return s;
}

fn hsl2rgb(hsl: vec3f) -> vec3f {
  if (hsl.y < 0.001) { return vec3f(hsl.z); }
  let tt = select(hsl.y * hsl.z + hsl.z, -hsl.y * hsl.z + (hsl.y + hsl.z), hsl.z >= 0.5);
  let s  = 2.0 * hsl.z - tt;
  return vec3f(
    hueToRGB(s, tt, hsl.x + 1.0/3.0),
    hueToRGB(s, tt, hsl.x),
    hueToRGB(s, tt, hsl.x - 1.0/3.0)
  );
}

fn rgb2hsl(c: vec3f) -> vec3f {
  let lo    = min(c.r, min(c.g, c.b));
  let hi    = max(c.r, max(c.g, c.b));
  let delta = hi - lo;
  let sum   = hi + lo;
  var hsl   = vec3f(0.0, 0.0, 0.5 * sum);
  if (delta < 0.001) { return hsl; }
  hsl.y = select(delta / (2.0 - sum), delta / sum, hsl.z < 0.5);
  if      (hi == c.r) { hsl.x = (c.g - c.b) / delta; }
  else if (hi == c.g) { hsl.x = (c.b - c.r) / delta + 2.0; }
  else                { hsl.x = (c.r - c.g) / delta + 4.0; }
  hsl.x = fmod(hsl.x / 6.0, 1.0);
  return hsl;
}

// ════════════════════════════════════
// §4 — Balatro Vortex (Card Back)
// ════════════════════════════════════

fn balatroVortex(
  fragCoord  : vec2f,
  resolution : vec2f,
  time       : f32,
  color1     : vec3f,
  color2     : vec3f,
  color3     : vec3f,
) -> vec3f {
  let PIXEL_SIZE_FAC = 700.0;
  let SPIN_AMOUNT    = 0.7;
  let SPIN_EASE      = 1.0;
  let CONTRAST       = 1.5;
  let ZOOM           = 18.0;

  let pixel_size = length(resolution) / PIXEL_SIZE_FAC;
  var uv = (floor(fragCoord / pixel_size) * pixel_size - 0.5 * resolution) / length(resolution);
  let uv_len = length(uv);

  let speed = (time * SPIN_EASE * 0.2) + 302.2;
  let new_pixel_angle = atan2(uv.y, uv.x)
    + speed
    - SPIN_EASE * 20.0 * (SPIN_AMOUNT * uv_len + (1.0 - SPIN_AMOUNT));

  let mid = (resolution / length(resolution)) / 2.0;
  uv = vec2f(
    uv_len * cos(new_pixel_angle) + mid.x,
    uv_len * sin(new_pixel_angle) + mid.y
  ) - mid;

  uv = uv * ZOOM;
  let wspeed = time * 2.0;
  var uv2 = vec2f(uv.x + uv.y);

  for (var i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv  += 0.5 * vec2f(
      cos(5.1123314 + 0.353 * uv2.y + wspeed * 0.131121),
      sin(uv2.x - 0.113 * wspeed)
    );
    uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
  }

  let contrast_mod = (0.25 * CONTRAST + 0.5 * SPIN_AMOUNT + 1.2);
  let paint_res    = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
  let c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  let c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  let c3p = 1.0 - min(1.0, c1p + c2p);

  return (0.3 / CONTRAST) * color1
    + (1.0 - 0.3 / CONTRAST)
      * (color1 * c1p + color2 * c2p + color3 * c3p);
}

// ════════════════════════════════════
// §5 — Holographic Diffraction
// ════════════════════════════════════

fn holoDiffraction(uv: vec2f, time: f32, mouse: vec2f) -> vec3f {
  let gridsize = 0.85;
  let g1 = max(0.0, 7.0 * abs(cos(uv.x * gridsize * 22.0 + time * 0.5)) - 6.0);
  let g2 = max(0.0, 7.0 * cos(uv.y * gridsize * 50.0 + uv.x * gridsize * 22.0 - time * 0.3) - 6.0);
  let g3 = max(0.0, 7.0 * cos(uv.y * gridsize * 50.0 - uv.x * gridsize * 22.0 + time * 0.4) - 6.0);
  let fac = 0.5 * max(max(g1, g2), g3);

  let mouseAngle = atan2(mouse.y, mouse.x);
  let angleFac   = 0.5 + 0.5 * sin(mouseAngle * 4.0 + time * 2.5 + uv.x * 10.0);

  let hue = fract(
    uv.x * 0.6 + uv.y * 0.4
    + time * 0.15
    + angleFac * 0.3
    + fac * 0.2
  );

  let holoColor = hsl2rgb(vec3f(hue, 1.0, 0.6 + fac * 0.15));
  let intensity = fac * 0.7 + angleFac * 0.3;
  return holoColor * intensity;
}

// ════════════════════════════════════
// §6 — Foil Shimmer
// ════════════════════════════════════

fn foilShimmer(uv: vec2f, time: f32) -> f32 {
  let adj   = uv - 0.5;
  let speed = time * 1.8;

  let fac1 = max(min(
    2.0 * sin(length(100.0 * adj) + speed * 2.0
      + 3.0 * (1.0 + 0.8 * cos(length(120.0 * adj) - speed * 3.5)))
    - 1.0 - max(5.0 - length(100.0 * adj), 0.0), 1.0), 0.0);

  let rotater = vec2f(cos(speed * 0.15), sin(speed * 0.4));
  let angle   = dot(rotater, adj) / max(length(rotater) * length(adj), 0.001);
  let fac2 = max(min(
    5.0 * cos(0.3 + angle * 3.14159265 * (2.4 + 0.9 * sin(speed * 1.8)))
    - 4.0 - max(2.0 - length(25.0 * adj), 0.0), 1.0), 0.0);

  let fac3 = 0.4 * max(min(2.0 * sin(speed * 5.5 + uv.x * 4.0 + 3.0 * (1.0 + 0.5 * cos(speed * 8.0))) - 1.0, 1.0), -1.0);
  let fac4 = 0.4 * max(min(2.0 * sin(speed * 7.0 + uv.y * 4.5 + 3.0 * (1.0 + 0.5 * cos(speed * 3.8))) - 1.0, 1.0), -1.0);

  return max(max(fac1, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.5 * (fac1 + fac2 + fac3 + fac4), 0.0);
}

// ════════════════════════════════════
// §7 — Vertex Shader
// ════════════════════════════════════

// Unit quad: position + texCoord both in [0,1]x[0,1]
const QUAD_POS = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
  vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
);

@vertex
fn vs_main(
  @builtin(vertex_index)   vi : u32,
  @builtin(instance_index) ii : u32,
) -> VertexOutput {
  let inst    = instances[ii];
  let a_pos   = QUAD_POS[vi];
  let a_tex   = a_pos;         // texcoord = position on unit quad

  // ── centre the quad ──
  var centered = a_pos * inst.size - inst.size * 0.5;

  // ── 3-D flip (Y-axis rotation, perspective foreshortening) ──
  let flipCos  = cos(inst.flipAngle);
  centered.x  *= flipCos;

  // ── Balatro pseudo-3-D tilt ──
  let tiltX = inst.mouseLocalX *  inst.tiltStrength * inst.hover;
  let tiltY = inst.mouseLocalY * -inst.tiltStrength * inst.hover;

  let normalizedPos = centered / inst.size;
  let edgeFactor    = dot(normalizedPos, normalizedPos) * 2.0;
  let zFactor       = 1.0 + (normalizedPos.x * tiltX + normalizedPos.y * tiltY)
                           * (1.0 + edgeFactor * 0.5);
  var perspCentered = centered * (1.0 + (1.0 - 1.0 / max(zFactor, 0.3)) * 0.25);

  // ── Hover scale ──
  let hoverScale  = 1.0 + inst.hover * 0.12;
  perspCentered  *= hoverScale;

  // ── Physics rotation ──
  let c = cos(inst.angle);
  let s = sin(inst.angle);
  let rotated = vec2f(
    perspCentered.x * c - perspCentered.y * s,
    perspCentered.x * s + perspCentered.y * c,
  );

  // ── Viewport transform (world → screen physical px) ──
  let world  = rotated + inst.translate;
  let screen = (world - globals.viewOffset) * globals.viewZoom;

  // ── Orthographic projection: [0, viewW] x [0, viewH] → NDC ──
  let ndc = vec2f(
     2.0 * screen.x / globals.viewW - 1.0,
    -2.0 * screen.y / globals.viewH + 1.0,
  );

  var out: VertexOutput;
  out.position    = vec4f(ndc, 0.0, 1.0);
  out.texCoord    = a_tex;
  out.localPos    = a_pos * inst.size;   // pixel-space within card+padding
  out.instanceIdx = ii;
  return out;
}

// ════════════════════════════════════
// §8 — Fragment Shader
// ════════════════════════════════════

const PI = 3.14159265;

// Padding ratios (shadow space) — portrait card: 180+48=228 x 260+48=308
const PAD_RX = 24.0 / 228.0;
const PAD_RY = 24.0 / 308.0;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let inst     = instances[in.instanceIdx];
  let time     = globals.time;
  let u_size   = inst.size;

  // ── Padding & geometry ──
  let pad      = vec2f(u_size.x * PAD_RX, u_size.y * PAD_RY);
  let cardSize = u_size - pad * 2.0;
  let cardHalf = cardSize * 0.5;
  let cardLocal = in.localPos - pad - cardHalf;

  let dist       = roundedBoxSDF(cardLocal, cardHalf, inst.radius);
  let contentUV  = (in.localPos - pad) / cardSize;
  let cp         = in.localPos - pad;

  // ── Shadow ──
  let lift       = 1.0 + inst.hover * 2.5 + inst.active * 2.0;
  let shadowOff  = vec2f(1.5, 4.0) * lift;
  let shadowBlur = 8.0 + inst.hover * 10.0 + inst.active * 5.0;

  let shadowDist1 = roundedBoxSDF(cardLocal - shadowOff,         cardHalf + 2.0,              inst.radius + 2.0);
  let shadowDist2 = roundedBoxSDF(cardLocal - shadowOff * 1.5,   cardHalf + shadowBlur * 0.5, inst.radius + 4.0);

  let shadow1 = smoothstep(0.0, shadowBlur * 0.6, -shadowDist1) * (0.35 + inst.hover * 0.15);
  let shadow2 = smoothstep(0.0, shadowBlur * 1.5, -shadowDist2) * (0.18 + inst.hover * 0.08);
  let shadow  = max(shadow1, shadow2);

  let cardAlpha = 1.0 - smoothstep(-1.0, 1.0, dist);

  if (cardAlpha < 0.01) {
    if (shadow < 0.01) { discard; }
    return vec4f(0.0, 0.0, 0.0, shadow);
  }

  // ── Front / Back ──
  let showBack = inst.flipAngle > PI * 0.5;
  var color    = vec3f(0.0);

  // ── Texture lookup ──
  let texLayer   = i32(inst.textureIndex);
  let mouseLocal = vec2f(inst.mouseLocalX, inst.mouseLocalY);

  if (showBack) {
    // ══════════════════════════════════════════════
    // ★ CARD BACK — BALATRO FLUID VORTEX ★
    // ══════════════════════════════════════════════
    let backUV       = vec2f(1.0 - contentUV.x, contentUV.y);
    let cardPixelCoord = backUV * cardSize;

    let kindHueShift = inst.kindIndex * 0.0588;
    let shiftedTape  = hsl2rgb(vec3f(fract(rgb2hsl(inst.tapeColor).x + kindHueShift * 0.3), 0.85, 0.45));
    let c1_back = mix(inst.tapeColor * 0.8, shiftedTape, 0.3);
    let c2_back = mix(vec3f(0.85, 0.7, 0.4), inst.tapeColor, 0.3);
    let c3_back = vec3f(0.06, 0.03, 0.08);

    color = balatroVortex(cardPixelCoord, cardSize, time, c1_back, c2_back, c3_back);

    let ct     = backUV - 0.5;
    let backGold = vec3f(0.85, 0.7, 0.35) * (0.9 + 0.1 * sin(time * 2.0 + ct.x * 10.0));

    // ── Diamond emblem ──
    let diamond = abs(ct.x) * 1.8 + abs(ct.y);
    let ring1   = smoothstep(0.12, 0.125, diamond) * (1.0 - smoothstep(0.13, 0.135, diamond));
    let ring2   = smoothstep(0.09, 0.093, diamond) * (1.0 - smoothstep(0.095, 0.098, diamond));
    color += backGold * ring1 * 0.5;
    color += backGold * ring2 * 0.3;

  } else {
    // ══════════════════════════════════════════════
    // ★ CARD FRONT — BALATRO TAROT STYLE ★
    // ══════════════════════════════════════════════
    let kindF = inst.kindIndex;
    let guv   = contentUV;

    // ── 1. Aged parchment base ──
    let parchNoise1 = gnoise(cp * 0.15) * 0.04;
    let parchNoise2 = gnoise(cp * 0.4 + vec2f(100.0)) * 0.02;
    var parchBase   = vec3f(0.92, 0.88, 0.82);
    let kindTint    = inst.tapeColor * 0.06;
    parchBase      += kindTint;
    parchBase      -= parchNoise1 + parchNoise2;

    let edgeDarken = smoothstep(0.0, 0.15, guv.x) * smoothstep(0.0, 0.15, guv.y)
                   * smoothstep(0.0, 0.15, 1.0 - guv.x) * smoothstep(0.0, 0.15, 1.0 - guv.y);
    parchBase -= (1.0 - edgeDarken) * 0.06;

    let stainX = 0.3 + sin(kindF * 2.1) * 0.2;
    let stainY = 0.6 + cos(kindF * 1.7) * 0.15;
    let stain  = smoothstep(0.12, 0.0, length(guv - vec2f(stainX, stainY))) * 0.03;
    parchBase -= vec3f(stain * 0.5, stain * 0.8, stain);

    color = parchBase;

    // ── 2. Subtle watermark ──
    let wc      = (guv - 0.5) * 2.0;
    let circle1 = abs(length(wc) - 0.5);
    let watermark = smoothstep(0.015, 0.005, circle1) * 0.02;
    let wmColor = mix(inst.tapeColor * 0.3, vec3f(0.75, 0.65, 0.5), 0.5);
    color = mix(color, wmColor, watermark);

    // ── 3. Content texture overlay ──
    var content = vec4f(0.0);
    if (contentUV.x >= 0.0 && contentUV.x <= 1.0 && contentUV.y >= 0.0 && contentUV.y <= 1.0) {
      content = textureSample(contentTexArray, contentSampler, contentUV, texLayer);
    }
    let texBlend = content.a * 0.92;
    color = mix(color, content.rgb, texBlend);

    // ── 5. Neon glow underlight ──
    let glowY   = smoothstep(0.12, 0.25, guv.y) * smoothstep(0.7, 0.5, guv.y);
    let glowX   = smoothstep(0.05, 0.15, guv.x) * smoothstep(0.95, 0.85, guv.x);
    let neonGlow  = glowX * glowY * 0.03;
    let neonColor = mix(inst.tapeColor, vec3f(1.0), 0.3);
    color += neonColor * neonGlow;

  }

  // ═══════════════════════════════════════════
  // ✦ FRONT-SIDE HOVER EFFECTS (Balatro)
  // ═══════════════════════════════════════════
  if (!showBack) {
    let euv = contentUV;

    // Kind-specific hover intensity
    var kindHoverBoost = 1.0;
    if      (inst.kindIndex < 3.5)  { kindHoverBoost = 1.2; }
    else if (inst.kindIndex < 7.5)  { kindHoverBoost = 0.9; }
    else if (inst.kindIndex < 11.5) { kindHoverBoost = 1.4; }

    // Foil / holographic effects are gated to flash cards (inst.flash > 0.5)
    if (inst.hover > 0.01 && inst.flash > 0.5) {
      // 1. Holographic diffraction
      let holoRGB  = holoDiffraction(euv, time, mouseLocal);
      let holoMask = length(holoRGB) * 0.5;
      color = mix(color, color + holoRGB * 0.4 * kindHoverBoost, inst.hover * holoMask);

      // 2. Foil shimmer
      let foil      = foilShimmer(euv, time);
      let mouseDist = length(mouseLocal);
      let mouseInfl = smoothstep(0.7, 0.0, mouseDist);
      let foilStr   = foil * (0.15 + mouseInfl * 0.85) * inst.hover;
      let foilColor = mix(vec3f(1.0, 0.9, 0.6), inst.tapeColor + vec3f(0.3), 0.25);
      color += foilColor * foilStr * 0.2;

      // 4. Polychrome color shift
      let polyPhase = euv.x * 2.5 + euv.y * 1.8 + time * 0.25;
      let polyShift = sin(polyPhase) * 0.5 + 0.5;
      var polyHSL   = rgb2hsl(color);
      polyHSL.x     = polyHSL.x + polyShift * 0.06 * inst.hover;
      polyHSL.y     = min(1.0, polyHSL.y + 0.12 * inst.hover);
      polyHSL.z     = min(0.95, polyHSL.z + 0.03 * inst.hover);
      color = mix(color, hsl2rgb(polyHSL), inst.hover * 0.35);

      // 5. Specular highlight
      let specPos  = mouseLocal * 0.35;
      let specDist2 = length(euv - 0.5 - specPos);
      let specular = exp(-specDist2 * specDist2 * 20.0) * inst.hover * 0.5;
      color += vec3f(1.0, 0.98, 0.95) * specular;

      // 7. Subtle Balatro vortex bleed on heavy hover
      if (inst.hover > 0.3) {
        let microCoord  = euv * cardSize * 0.3;
        let microVortex = balatroVortex(microCoord, cardSize * 0.3, time * 0.5,
                            inst.tapeColor, vec3f(1.0), vec3f(0.0));
        let bleedMask   = 1.0 - smoothstep(0.0, 0.15, length(euv - 0.5 - mouseLocal * 0.3));
        color = mix(color, microVortex, bleedMask * (inst.hover - 0.3) * 0.15);
      }
    }
  }

  // ═══════════════════════════════════════════
  // ✦ BACK-SIDE HOVER EFFECTS
  // ═══════════════════════════════════════════
  if (showBack && inst.hover > 0.01) {
    let backSpecPos  = mouseLocal * 0.3;
    let backUV2      = vec2f(1.0 - contentUV.x, contentUV.y);
    let backSpecDist = length(backUV2 - 0.5 - backSpecPos);
    let backSpec     = exp(-backSpecDist * backSpecDist * 15.0) * inst.hover * 0.3;
    color += vec3f(1.0, 0.98, 0.95) * backSpec;
  }

  // ── AI Streaming pulse ──
  if (inst.streaming > 0.01) {
    let pulseWave  = sin(time * 4.5 + cp.x * 0.02 + cp.y * 0.015) * 0.5 + 0.5;
    let borderGlow = smoothstep(2.0, -2.0, dist) * (1.0 - smoothstep(-2.0, -8.0, dist));
    let streamColor = hsl2rgb(vec3f(fract(time * 0.25 + cp.x * 0.001), 0.85, 0.6));
    color += borderGlow * pulseWave * streamColor * inst.streaming * 0.6;
  }

  // ── Flip transition glow ──
  if (inst.flipProgress > 0.01 && inst.flipProgress < 0.99) {
    let flipGlow  = sin(inst.flipProgress * PI) * 0.4;
    let flipColor = hsl2rgb(vec3f(fract(time * 0.6), 0.85, 0.7));
    let edgeMask  = smoothstep(2.0, -2.0, dist) * (1.0 - smoothstep(-2.0, -7.0, dist));
    color += flipColor * flipGlow * edgeMask;
  }

  // ── Hidden state (filter mismatch) ──
  if (inst.hidden > 0.5) {
    let grayVal = dot(color, vec3f(0.299, 0.587, 0.114));
    color = mix(color, vec3f(grayVal), 0.65);
    return vec4f(color, cardAlpha * 0.2);
  }

  return vec4f(color, cardAlpha);
}
`
