// ══════════════════════════════════════════════════════════════
// WebGL Shaders — BALATRO ULTIMATE EDITION v5
// Features:
//   ✦ Infinite canvas viewport (pan + zoom)
//   ✦ Real 3D card flip with perspective
//   ✦ ★ BALATRO fluid vortex card back (pixel + spin + domain warp + 3-color) ★
//   ✦ ★ Enhanced Balatro-style holographic + foil + polychrome on hover ★
//   ✦ ★ Balatro card hover: 3D perspective warp (vertex displacement) ★
//   ✦ Proper natural shadow (soft, directional)
//   ✦ Rainbow edge glow + specular highlights
// ══════════════════════════════════════════════════════════════

export const CARD_VERTEX_SHADER = `
  precision highp float;

  attribute vec2 a_position;
  attribute vec2 a_texCoord;

  uniform mat3 u_projection;
  uniform vec2 u_translate;
  uniform float u_angle;
  uniform vec2 u_size;

  // ── Viewport (pan + zoom) ──
  uniform vec2 u_viewOffset;
  uniform float u_viewZoom;

  // ── 3D flip ──
  uniform float u_flipAngle;

  // ── Pseudo-3D perspective (Balatro-style card warp) ──
  uniform vec2 u_mouseLocal;
  uniform float u_hover;
  uniform float u_tiltStrength;

  varying vec2 v_texCoord;
  varying vec2 v_localPos;

  void main() {
    vec2 centered = a_position * u_size - u_size * 0.5;

    // ── 3D Flip (Y-axis rotation with perspective foreshortening) ──
    float flipCos = cos(u_flipAngle);
    centered.x *= flipCos;

    // ── Balatro-style pseudo-3D tilt (card hover warp) ──
    // Stronger effect: card bends toward the mouse cursor
    float tiltX = u_mouseLocal.x * u_tiltStrength * u_hover;
    float tiltY = -u_mouseLocal.y * u_tiltStrength * u_hover;

    // Non-linear warp: vertices further from center deform more
    vec2 normalizedPos = centered / u_size;
    float edgeFactor = dot(normalizedPos, normalizedPos) * 2.0;
    float zFactor = 1.0 + (normalizedPos.x * tiltX + normalizedPos.y * tiltY) * (1.0 + edgeFactor * 0.5);
    vec2 perspCentered = centered * (1.0 + (1.0 - 1.0 / max(zFactor, 0.3)) * 0.25);

    // Pop-up on hover (scale up slightly)
    float hoverScale = 1.0 + u_hover * 0.12;
    perspCentered *= hoverScale;

    // ── Physics rotation ──
    float c = cos(u_angle);
    float s = sin(u_angle);
    vec2 rotated = vec2(
      perspCentered.x * c - perspCentered.y * s,
      perspCentered.x * s + perspCentered.y * c
    );

    // ── Viewport transform (world → screen) ──
    vec2 world = rotated + u_translate;
    vec2 screen = (world - u_viewOffset) * u_viewZoom;

    vec3 projected = u_projection * vec3(screen, 1.0);
    gl_Position = vec4(projected.xy, 0.0, 1.0);

    v_texCoord = a_texCoord;
    v_localPos = a_position * u_size;
  }
`

export const CARD_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 v_texCoord;
  varying vec2 v_localPos;

  uniform sampler2D u_contentTex;
  uniform vec2 u_size;
  uniform float u_radius;
  uniform float u_time;
  uniform float u_hover;
  uniform float u_active;
  uniform float u_streaming;
  uniform float u_selected;
  uniform float u_hidden;
  uniform float u_flash;
  uniform vec3 u_tapeColor;
  uniform vec3 u_edgeColor;
  uniform vec2 u_mouseLocal;
  uniform float u_flipAngle;
  uniform float u_flipProgress;
  uniform float u_kindIndex;

  // Padding ratios (shadow space) — portrait card: 180+48=228 x 260+48=308
  const float PAD_RX = 24.0 / 228.0;
  const float PAD_RY = 24.0 / 308.0;
  const float PI = 3.14159265;

  // ═══════════════════════════════
  // ── SDF & Noise ──
  // ═══════════════════════════════
  float roundedBoxSDF(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return length(max(q, 0.0)) - r;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  // ═══════════════════════════════
  // ── HSL ↔ RGB ──
  // ═══════════════════════════════
  float hueToRGB(float s, float t, float h) {
    float hs = mod(h, 1.0) * 6.0;
    if (hs < 1.0) return (t - s) * hs + s;
    if (hs < 3.0) return t;
    if (hs < 4.0) return (t - s) * (4.0 - hs) + s;
    return s;
  }

  vec3 hsl2rgb(vec3 hsl) {
    if (hsl.y < 0.001) return vec3(hsl.z);
    float t = (hsl.z < 0.5) ? hsl.y * hsl.z + hsl.z : -hsl.y * hsl.z + (hsl.y + hsl.z);
    float s = 2.0 * hsl.z - t;
    return vec3(
      hueToRGB(s, t, hsl.x + 1.0/3.0),
      hueToRGB(s, t, hsl.x),
      hueToRGB(s, t, hsl.x - 1.0/3.0)
    );
  }

  vec3 rgb2hsl(vec3 c) {
    float lo = min(c.r, min(c.g, c.b));
    float hi = max(c.r, max(c.g, c.b));
    float delta = hi - lo;
    float sum = hi + lo;
    vec3 hsl = vec3(0.0, 0.0, 0.5 * sum);
    if (delta < 0.001) return hsl;
    hsl.y = (hsl.z < 0.5) ? delta / sum : delta / (2.0 - sum);
    if (hi == c.r)      hsl.x = (c.g - c.b) / delta;
    else if (hi == c.g) hsl.x = (c.b - c.r) / delta + 2.0;
    else                hsl.x = (c.r - c.g) / delta + 4.0;
    hsl.x = mod(hsl.x / 6.0, 1.0);
    return hsl;
  }

  // ═══════════════════════════════════════════════════════
  // ★★★ BALATRO FLUID VORTEX — Card Back Effect ★★★
  // Ported from Balatro game shader (LÖVE2D → WebGL)
  // Pixelation + Spin vortex + 5-pass domain warp + 3-color blend
  // ═══════════════════════════════════════════════════════
  vec3 balatroVortex(vec2 fragCoord, vec2 resolution, float time, vec3 color1, vec3 color2, vec3 color3) {
    // ── Config ──
    float PIXEL_SIZE_FAC = 700.0;     // Pixel grid density (higher = finer)
    float SPIN_AMOUNT = 0.7;          // Vortex spin strength
    float SPIN_EASE = 1.0;            // Spin easing factor
    float CONTRAST = 1.5;             // Color contrast
    float ZOOM = 18.0;                // Pattern zoom (lower = bigger patterns)

    // ── Pixelation ──
    float pixel_size = length(resolution) / PIXEL_SIZE_FAC;
    vec2 uv = (floor(fragCoord / pixel_size) * pixel_size - 0.5 * resolution) / length(resolution);
    float uv_len = length(uv);

    // ── Spin vortex (polar coordinate rotation) ──
    float speed = (time * SPIN_EASE * 0.2) + 302.2;
    float new_pixel_angle = atan(uv.y, uv.x)
      + speed
      - SPIN_EASE * 20.0 * (SPIN_AMOUNT * uv_len + (1.0 - SPIN_AMOUNT));

    vec2 mid = (resolution / length(resolution)) / 2.0;
    uv = vec2(
      uv_len * cos(new_pixel_angle) + mid.x,
      uv_len * sin(new_pixel_angle) + mid.y
    ) - mid;

    // ── Domain warping: 5 iterative passes ──
    uv *= ZOOM;
    speed = time * 2.0;
    vec2 uv2 = vec2(uv.x + uv.y);

    for (int i = 0; i < 5; i++) {
      uv2 += sin(max(uv.x, uv.y)) + uv;
      uv += 0.5 * vec2(
        cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
        sin(uv2.x - 0.113 * speed)
      );
      uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
    }

    // ── Three-color blend based on warped UV distance ──
    float contrast_mod = (0.25 * CONTRAST + 0.5 * SPIN_AMOUNT + 1.2);
    float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
    float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
    float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
    float c3p = 1.0 - min(1.0, c1p + c2p);

    // Blend with base tint
    vec3 result = (0.3 / CONTRAST) * color1
      + (1.0 - 0.3 / CONTRAST)
        * (color1 * c1p + color2 * c2p + color3 * c3p);

    return result;
  }

  // ═══════════════════════════════════════════
  // ── Enhanced Holographic Diffraction ──
  // ═══════════════════════════════════════════
  vec3 holoDiffraction(vec2 uv, float time, vec2 mouse) {
    float gridsize = 0.85;
    float g1 = max(0.0, 7.0 * abs(cos(uv.x * gridsize * 22.0 + time * 0.5)) - 6.0);
    float g2 = max(0.0, 7.0 * cos(uv.y * gridsize * 50.0 + uv.x * gridsize * 22.0 - time * 0.3) - 6.0);
    float g3 = max(0.0, 7.0 * cos(uv.y * gridsize * 50.0 - uv.x * gridsize * 22.0 + time * 0.4) - 6.0);
    float fac = 0.5 * max(max(g1, g2), g3);

    float mouseAngle = atan(mouse.y, mouse.x);
    float angleFac = 0.5 + 0.5 * sin(mouseAngle * 4.0 + time * 2.5 + uv.x * 10.0);

    float hue = fract(
      uv.x * 0.6 + uv.y * 0.4
      + time * 0.15
      + angleFac * 0.3
      + fac * 0.2
    );

    vec3 holoColor = hsl2rgb(vec3(hue, 1.0, 0.6 + fac * 0.15));
    float intensity = fac * 0.7 + angleFac * 0.3;

    return holoColor * intensity;
  }

  // ═══════════════════════════════════════════
  // ── Enhanced Foil Shimmer ──
  // ═══════════════════════════════════════════
  float foilShimmer(vec2 uv, float time) {
    vec2 adj = uv - 0.5;
    float speed = time * 1.8;

    float fac1 = max(min(
      2.0 * sin(length(100.0 * adj) + speed * 2.0
        + 3.0 * (1.0 + 0.8 * cos(length(120.0 * adj) - speed * 3.5)))
      - 1.0 - max(5.0 - length(100.0 * adj), 0.0), 1.0), 0.0);

    vec2 rotater = vec2(cos(speed * 0.15), sin(speed * 0.4));
    float angle = dot(rotater, adj) / max(length(rotater) * length(adj), 0.001);
    float fac2 = max(min(
      5.0 * cos(0.3 + angle * PI * (2.4 + 0.9 * sin(speed * 1.8)))
      - 4.0 - max(2.0 - length(25.0 * adj), 0.0), 1.0), 0.0);

    float fac3 = 0.4 * max(min(2.0 * sin(speed * 5.5 + uv.x * 4.0 + 3.0 * (1.0 + 0.5 * cos(speed * 8.0))) - 1.0, 1.0), -1.0);
    float fac4 = 0.4 * max(min(2.0 * sin(speed * 7.0 + uv.y * 4.5 + 3.0 * (1.0 + 0.5 * cos(speed * 3.8))) - 1.0, 1.0), -1.0);

    return max(max(fac1, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.5 * (fac1 + fac2 + fac3 + fac4), 0.0);
  }

  // ═══════════════════════════════════════════
  // ── MAIN ──
  // ═══════════════════════════════════════════
  void main() {
    // ── Padding & geometry ──
    vec2 pad = vec2(u_size.x * PAD_RX, u_size.y * PAD_RY);
    vec2 cardSize = u_size - pad * 2.0;
    vec2 cardHalf = cardSize * 0.5;
    vec2 cardLocal = v_localPos - pad - cardHalf;

    float dist = roundedBoxSDF(cardLocal, cardHalf, u_radius);
    vec2 contentUV = (v_localPos - pad) / cardSize;
    vec2 cp = v_localPos - pad;

    // ═══════════════════════════════
    // ── Shadow (natural, soft) ──
    // ═══════════════════════════════
    float lift = 1.0 + u_hover * 2.5 + u_active * 2.0;
    vec2 shadowOff = vec2(1.5, 4.0) * lift;
    float shadowBlur = 8.0 + u_hover * 10.0 + u_active * 5.0;

    float shadowDist1 = roundedBoxSDF(cardLocal - shadowOff, cardHalf + 2.0, u_radius + 2.0);
    float shadowDist2 = roundedBoxSDF(cardLocal - shadowOff * 1.5, cardHalf + shadowBlur * 0.5, u_radius + 4.0);

    float shadow1 = smoothstep(0.0, shadowBlur * 0.6, -shadowDist1) * (0.35 + u_hover * 0.15);
    float shadow2 = smoothstep(0.0, shadowBlur * 1.5, -shadowDist2) * (0.18 + u_hover * 0.08);
    float shadow = max(shadow1, shadow2);

    // Anti-aliased card edge
    float cardAlpha = 1.0 - smoothstep(-1.0, 1.0, dist);

    if (cardAlpha < 0.01) {
      if (shadow < 0.01) discard;
      gl_FragColor = vec4(0.0, 0.0, 0.0, shadow);  // shadow is already black×alpha (premultiplied)
      return;
    }

    // ═══════════════════════════════
    // ── Front / Back switch ──
    // ═══════════════════════════════
    bool showBack = u_flipAngle > PI * 0.5;
    vec3 color;

    if (showBack) {
      // ══════════════════════════════════════════════
      // ★★★ CARD BACK — BALATRO FLUID VORTEX ★★★
      // ══════════════════════════════════════════════
      vec2 backUV = vec2(1.0 - contentUV.x, contentUV.y);

      // Generate Balatro vortex in card-local pixel space
      vec2 cardPixelCoord = backUV * cardSize;
      vec2 cardRes = cardSize;

      // Three colors derived from the card's accent color + kind-based hue shift
      // Deeper, more psychedelic — dark red, purple, black palette
      float kindHueShift = u_kindIndex * 0.0588;
      vec3 shiftedTape = hsl2rgb(vec3(fract(rgb2hsl(u_tapeColor).x + kindHueShift * 0.3), 0.85, 0.45));
      vec3 c1_back = mix(u_tapeColor * 0.8, shiftedTape, 0.3);
      vec3 c2_back = mix(vec3(0.85, 0.7, 0.4), u_tapeColor, 0.3); // Gold highlight
      vec3 c3_back = vec3(0.06, 0.03, 0.08); // Deep purple-black

      color = balatroVortex(cardPixelCoord, cardRes, u_time, c1_back, c2_back, c3_back);

      // ── Ornate gold border frame on top of vortex ──
      vec2 ct = backUV - 0.5;
      float margin = 0.05;
      float bw = 0.005;
      vec2 buv = abs(ct);
      float bx = smoothstep(0.5 - margin - bw, 0.5 - margin, buv.x)
               * (1.0 - smoothstep(0.5 - margin, 0.5 - margin + bw, buv.x));
      float by = smoothstep(0.5 - margin - bw, 0.5 - margin, buv.y)
               * (1.0 - smoothstep(0.5 - margin, 0.5 - margin + bw, buv.y));
      float borderMask = max(bx * step(buv.y, 0.5 - margin + bw), by * step(buv.x, 0.5 - margin + bw));
      // Inner secondary border
      float margin2 = 0.08;
      float bw2 = 0.003;
      float bx2 = smoothstep(0.5 - margin2 - bw2, 0.5 - margin2, buv.x)
                * (1.0 - smoothstep(0.5 - margin2, 0.5 - margin2 + bw2, buv.x));
      float by2 = smoothstep(0.5 - margin2 - bw2, 0.5 - margin2, buv.y)
                * (1.0 - smoothstep(0.5 - margin2, 0.5 - margin2 + bw2, buv.y));
      float innerBorderMask = max(bx2 * step(buv.y, 0.5 - margin2 + bw2), by2 * step(buv.x, 0.5 - margin2 + bw2));

      // Gold color with shimmer
      vec3 backGold = vec3(0.85, 0.7, 0.35) * (0.9 + 0.1 * sin(u_time * 2.0 + ct.x * 10.0));
      color += backGold * borderMask * 0.5;
      color += backGold * 0.6 * innerBorderMask * 0.3;

      // ── Center diamond emblem (larger, more ornate) ──
      float diamond = abs(ct.x) * 1.8 + abs(ct.y);
      float ring1 = smoothstep(0.12, 0.125, diamond) * (1.0 - smoothstep(0.13, 0.135, diamond));
      float ring2 = smoothstep(0.09, 0.093, diamond) * (1.0 - smoothstep(0.095, 0.098, diamond));
      color += backGold * ring1 * 0.5;
      color += backGold * ring2 * 0.3;

    } else {
      // ══════════════════════════════════════════════
      // ★★★ CARD FRONT — BALATRO TAROT STYLE ★★★
      // Aged parchment + gold border + constellation watermark
      // ══════════════════════════════════════════════

      float kindF = u_kindIndex;
      vec2 guv = contentUV;
      float hSeed = kindF * 0.0588;

      // ── 1. Aged parchment base (warm, yellowed, uneven) ──
      float parchNoise1 = noise(cp * 0.15) * 0.04;
      float parchNoise2 = noise(cp * 0.4 + 100.0) * 0.02;
      float parchNoise3 = noise(cp * 0.08 + 200.0) * 0.03;
      // Base: warm cream with kind-dependent tint
      vec3 parchBase = vec3(0.92, 0.88, 0.82); // warm parchment
      // Tint by card type
      vec3 kindTint = u_tapeColor * 0.06;
      parchBase += kindTint;
      // Aged uneven coloring
      parchBase -= parchNoise1 + parchNoise2;
      // Slight darkening at edges (foxing)
      float edgeDarken = smoothstep(0.0, 0.15, guv.x) * smoothstep(0.0, 0.15, guv.y)
                       * smoothstep(0.0, 0.15, 1.0 - guv.x) * smoothstep(0.0, 0.15, 1.0 - guv.y);
      parchBase -= (1.0 - edgeDarken) * 0.06;
      // Coffee stain mark (per-kind positioned)
      float stainX = 0.3 + sin(kindF * 2.1) * 0.2;
      float stainY = 0.6 + cos(kindF * 1.7) * 0.15;
      float stain = smoothstep(0.12, 0.0, length(guv - vec2(stainX, stainY))) * 0.03;
      parchBase -= vec3(stain * 0.5, stain * 0.8, stain);

      color = parchBase;

      // ── 2. Subtle single circle watermark (very faint) ──
      vec2 wc = (guv - 0.5) * 2.0;
      float circle1 = abs(length(wc) - 0.5);
      float watermark = smoothstep(0.015, 0.005, circle1) * 0.02;
      vec3 wmColor = mix(u_tapeColor * 0.3, vec3(0.75, 0.65, 0.5), 0.5);
      color = mix(color, wmColor, watermark);

      // ── 3. Content texture overlay ──
      vec4 content = vec4(0.0);
      if (contentUV.x >= 0.0 && contentUV.x <= 1.0 && contentUV.y >= 0.0 && contentUV.y <= 1.0) {
        content = texture2D(u_contentTex, contentUV);
      }
      // Cap texture alpha so parchment always shows through (prevents pure-black cards)
      float texBlend = content.a * 0.92;
      color = mix(color, content.rgb, texBlend);

      // ── 4. Ornate gold/metallic border frame ──
      // Double border with inner and outer lines
      float borderMargin = 5.0;
      float borderW = 1.2;
      float innerMargin = 9.0;
      float innerW = 0.6;

      // Outer ornate border
      float outerL = smoothstep(borderMargin + borderW, borderMargin, cp.x);
      float outerR = smoothstep(cardSize.x - borderMargin - borderW, cardSize.x - borderMargin, cp.x);
      float outerT = smoothstep(borderMargin + borderW, borderMargin, cp.y);
      float outerB = smoothstep(cardSize.y - borderMargin - borderW, cardSize.y - borderMargin, cp.y);
      float outerBorder = max(max(outerL, outerR), max(outerT, outerB));
      // Only draw on the edges (not filling the card)
      float outerMask = step(cp.x, borderMargin + borderW) + step(cardSize.x - borderMargin - borderW, cp.x)
                      + step(cp.y, borderMargin + borderW) + step(cardSize.y - borderMargin - borderW, cp.y);
      outerMask = min(outerMask, 1.0);

      // Inner thin border
      float innerL = smoothstep(innerMargin + innerW, innerMargin, cp.x)
                   * (1.0 - smoothstep(innerMargin - innerW, innerMargin, cp.x));
      float innerR = smoothstep(cardSize.x - innerMargin - innerW, cardSize.x - innerMargin, cp.x)
                   * (1.0 - smoothstep(cardSize.x - innerMargin, cardSize.x - innerMargin + innerW, cp.x));
      float innerT = smoothstep(innerMargin + innerW, innerMargin, cp.y)
                   * (1.0 - smoothstep(innerMargin - innerW, innerMargin, cp.y));
      float innerB = smoothstep(cardSize.y - innerMargin - innerW, cardSize.y - innerMargin, cp.y)
                   * (1.0 - smoothstep(cardSize.y - innerMargin, cardSize.y - innerMargin + innerW, cp.y));
      float innerBorder = max(max(innerL, innerR), max(innerT, innerB));

      // Gold color with slight shimmer
      float goldShimmer = 0.9 + 0.1 * sin(u_time * 1.5 + cp.x * 0.05 + cp.y * 0.03);
      vec3 goldColor = vec3(0.85, 0.70, 0.35) * goldShimmer;
      vec3 darkGold = vec3(0.65, 0.50, 0.25);

      // Apply borders
      color = mix(color, goldColor, outerBorder * outerMask * 0.85);
      color = mix(color, darkGold, innerBorder * 0.5);

      // ── 5. Neon glow text underlight (subtle neon underlight) ──
      // Faint colored glow under the content area
      float glowY = smoothstep(0.12, 0.25, guv.y) * smoothstep(0.7, 0.5, guv.y);
      float glowX = smoothstep(0.05, 0.15, guv.x) * smoothstep(0.95, 0.85, guv.x);
      float neonGlow = glowX * glowY * 0.03;
      vec3 neonColor = mix(u_tapeColor, vec3(1.0), 0.3);
      color += neonColor * neonGlow;

      // ── 6. Top accent band with kind color ──
      float topBand = smoothstep(0.0, 1.5, cp.y) * (1.0 - smoothstep(2.5, 4.0, cp.y));
      color = mix(color, u_tapeColor * 0.7 + vec3(0.3), topBand * 0.3);

      // ── 7. Bottom ornamental line ──
      float bottomLine = smoothstep(cardSize.y - 12.0, cardSize.y - 10.0, cp.y)
                       * (1.0 - smoothstep(cardSize.y - 10.0, cardSize.y - 8.0, cp.y));
      color = mix(color, darkGold, bottomLine * 0.35);
    }

    // ═══════════════════════════════════════════════
    // ✦ FRONT-SIDE HOVER EFFECTS (Balatro-enhanced) ✦
    // ═══════════════════════════════════════════════

    if (!showBack && u_hover > 0.01 && u_flash > 0.5) {
      vec2 euv = contentUV;

      // ── Kind-specific hover intensity ──
      float kindHoverBoost = 1.0;
      if (u_kindIndex < 3.5) kindHoverBoost = 1.2;
      else if (u_kindIndex < 7.5) kindHoverBoost = 0.9;
      else if (u_kindIndex < 11.5) kindHoverBoost = 1.4;
      else kindHoverBoost = 1.0;

      // ── 1. Holographic Diffraction Grating ──
      vec3 holoRGB = holoDiffraction(euv, u_time, u_mouseLocal);
      float holoMask = length(holoRGB) * 0.5;
      color = mix(color, color + holoRGB * 0.4 * kindHoverBoost, u_hover * holoMask);

      // ── 2. Foil Shimmer (metallic sparkle) ──
      float foil = foilShimmer(euv, u_time);
      float mouseDist = length(u_mouseLocal);
      float mouseInfl = smoothstep(0.7, 0.0, mouseDist);
      float foilStr = foil * (0.15 + mouseInfl * 0.85) * u_hover;
      vec3 foilColor = mix(vec3(1.0, 0.9, 0.6), u_tapeColor + vec3(0.3), 0.25);
      color += foilColor * foilStr * 0.2;

      // ── 3. Gold border glow on hover ──
      float borderGlowMask = step(cp.x, 7.0) + step(cardSize.x - 7.0, cp.x)
                           + step(cp.y, 7.0) + step(cardSize.y - 7.0, cp.y);
      borderGlowMask = min(borderGlowMask, 1.0);
      vec3 glowGold = vec3(1.0, 0.85, 0.4);
      color += glowGold * borderGlowMask * u_hover * 0.3 * (0.8 + 0.2 * sin(u_time * 3.0));

      // ── 4. Polychrome color shift (oil-slick) ──
      float polyPhase = euv.x * 2.5 + euv.y * 1.8 + u_time * 0.25;
      float polyShift = sin(polyPhase) * 0.5 + 0.5;
      vec3 polyHSL = rgb2hsl(color);
      polyHSL.x = polyHSL.x + polyShift * 0.06 * u_hover;
      polyHSL.y = min(1.0, polyHSL.y + 0.12 * u_hover);
      polyHSL.z = min(0.95, polyHSL.z + 0.03 * u_hover);
      color = mix(color, hsl2rgb(polyHSL), u_hover * 0.35);

      // ── 5. Specular highlight (follows mouse, brighter) ──
      vec2 specPos = u_mouseLocal * 0.35;
      float specDist = length(euv - 0.5 - specPos);
      float specular = exp(-specDist * specDist * 20.0) * u_hover * 0.5;
      color += vec3(1.0, 0.98, 0.95) * specular;

      // ── 6. Rainbow edge glow (Balatro signature) ──
      float glowDist = abs(dist + 3.0) / 5.0;
      float edgeGlow = exp(-glowDist * glowDist) * u_hover * 0.8;
      float rainbowAngle = atan(cardLocal.y, cardLocal.x);
      vec3 rainbowColor = hsl2rgb(vec3(
        fract(rainbowAngle / (2.0 * PI) + u_time * 0.3),
        0.9,
        0.65
      ));
      color += edgeGlow * rainbowColor;

      // ── 7. Subtle Balatro vortex bleed on hover (micro swirl in background) ──
      if (u_hover > 0.3) {
        vec2 microCoord = euv * cardSize * 0.3;
        vec3 microVortex = balatroVortex(microCoord, cardSize * 0.3, u_time * 0.5, u_tapeColor, vec3(1.0), vec3(0.0));
        float bleedMask = (1.0 - smoothstep(0.0, 0.15, length(euv - 0.5 - u_mouseLocal * 0.3)));
        color = mix(color, microVortex, bleedMask * (u_hover - 0.3) * 0.15);
      }
    }

    // ═══════════════════════════════════════════
    // ✦ BACK-SIDE HOVER EFFECTS ✦
    // ═══════════════════════════════════════════

    if (showBack && u_hover > 0.01) {
      // Rainbow edge glow on back too
      float backGlow = abs(dist + 3.0) / 5.0;
      float backEdge = exp(-backGlow * backGlow) * 0.5;
      float backAngle = atan(cardLocal.y, cardLocal.x);
      vec3 backGlowColor = hsl2rgb(vec3(fract(backAngle / (2.0 * PI) + u_time * 0.4), 0.9, 0.65));
      color += backEdge * backGlowColor * u_hover;

      // Specular highlight on back
      vec2 backSpecPos = u_mouseLocal * 0.3;
      vec2 backUV2 = vec2(1.0 - contentUV.x, contentUV.y);
      float backSpecDist = length(backUV2 - 0.5 - backSpecPos);
      float backSpec = exp(-backSpecDist * backSpecDist * 15.0) * u_hover * 0.3;
      color += vec3(1.0, 0.98, 0.95) * backSpec;
    }

    // ── Active (dragging) — arcane energy glow ──
    if (u_active > 0.01) {
      color += smoothstep(0.0, 4.0, -dist) * u_active * 0.06;
      // Golden energy ring
      float dragGlow = abs(dist + 2.0) / 3.5;
      float dragRing = exp(-dragGlow * dragGlow) * u_active * 0.6;
      vec3 dragColor = mix(vec3(0.9, 0.75, 0.35), u_tapeColor, 0.4);
      color += dragColor * dragRing;
      // Secondary outer glow
      float outerGlow = abs(dist + 5.0) / 6.0;
      float outerRing = exp(-outerGlow * outerGlow) * u_active * 0.25;
      color += u_tapeColor * outerRing;
    }

    // ── AI Streaming pulse ──
    if (u_streaming > 0.01) {
      float pulseWave = sin(u_time * 4.5 + cp.x * 0.02 + cp.y * 0.015) * 0.5 + 0.5;
      float borderGlow = smoothstep(2.0, -2.0, dist) * (1.0 - smoothstep(-2.0, -8.0, dist));
      vec3 streamColor = hsl2rgb(vec3(fract(u_time * 0.25 + cp.x * 0.001), 0.85, 0.6));
      color += borderGlow * pulseWave * streamColor * u_streaming * 0.6;
    }

    // ── 3D Flip transition glow ──
    if (u_flipProgress > 0.01 && u_flipProgress < 0.99) {
      float flipGlow = sin(u_flipProgress * PI) * 0.4;
      vec3 flipColor = hsl2rgb(vec3(fract(u_time * 0.6), 0.85, 0.7));
      float edgeMask = smoothstep(2.0, -2.0, dist) * (1.0 - smoothstep(-2.0, -7.0, dist));
      color += flipColor * flipGlow * edgeMask;
    }

    // ── Card edge highlight (3D depth) + idle breathing glow ──
    float insetTop = smoothstep(-0.5, 0.5, cp.y) * 0.012;
    float insetSide = (smoothstep(-0.5, 0.5, cp.x) + smoothstep(-0.5, 0.5, cardSize.x - cp.x)) * 0.006;
    color += vec3(1.0, 0.95, 0.8) * (insetTop + insetSide);

    // ── Idle breathing glow (subtle pulsing gold edge aura) ──
    if (!showBack) {
      float breathe = 0.5 + 0.5 * sin(u_time * 1.2 + u_kindIndex * 0.5);
      float edgeProximity = smoothstep(6.0, 0.0, abs(dist + 1.0));
      vec3 breatheColor = mix(vec3(0.8, 0.65, 0.3), u_tapeColor, 0.3);
      color += breatheColor * edgeProximity * breathe * 0.06 * (1.0 - u_hover);
    }

    // ── Selected card — blue glow border ──
    if (u_selected > 0.01) {
      float selGlow = abs(dist + 2.0) / 4.0;
      float selRing = exp(-selGlow * selGlow) * u_selected * 0.9;
      vec3 selColor = vec3(0.3, 0.6, 1.0);
      color += selColor * selRing;
      // Subtle blue tint overlay
      color = mix(color, selColor, u_selected * 0.06);
    }

    // ── semi-hidden state (filter non-matching cards) — desaturate + reduce opacity ──
    if (u_hidden > 0.5) {
      float grayVal = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(grayVal), 0.65);
      float a = cardAlpha * 0.2;
      gl_FragColor = vec4(color * a, a);  // premultiplied
    } else {
      gl_FragColor = vec4(color * cardAlpha, cardAlpha);  // premultiplied
    }
  }
`
