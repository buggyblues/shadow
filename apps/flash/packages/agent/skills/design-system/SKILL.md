---
name: design-system
description: Apply professional design principles to Slide JSX presentations — layout mastery, content depth, premium texture, atmospheric decoration, and visual continuity.
version: 2.0.0
metadata:
  openclaw:
    emoji: "✨"
---

# Design System Skill

Apply professional design principles to create visually compelling presentations. This skill defines the **five core design principles**, typography system, color guidance, and layout patterns.

## When to Use

Activate when the user:
- Asks for design advice or style recommendations
- Wants to improve the visual quality of their slides
- Needs help choosing colors, fonts, or layout patterns
- Requests a specific design style (corporate, creative, minimal, etc.)

---

## Five Core Design Principles

### 1. Professional Layout

- **Expert-level typesetting:** Use magazine-quality PPT layouts with bold typography and visual effects (shadows, opacity, rotation, etc.) to give slides a dynamic feel rather than a rigid one.
- **Adaptive structure:** Layout density must match the content and theme. When information is sparse, scale elements up to fill the canvas; when information is dense, scale down to maintain clarity.
- **Information density principle:** Keep higher density in core-argument areas and use deliberate whitespace for supporting details, ensuring visual load is manageable and the reading path is clear.
- **Content page title scale:** Content page titles should not be oversized — avoid letting them overshadow the body content.
- **Reject mediocrity:** Simple web-card stacking and rigid grid-only layouts are strictly forbidden. Layouts must have variation and rhythm.

### 2. Effective Content

- **McKinsey-style logical narrative:** Emphasize logic, relationships, structure, and insight. Slide titles must be full assertions or conclusions that carry conviction.
- **Visualization first:** Prioritize visual storytelling (SVG / charts / flowcharts, etc.) over walls of plain text.
- **Emphasis amplification:** Use prominent colors and highlight effects to maximize the impact of core content. Simple, repetitive bullet-list recitation is strictly forbidden.
- **Visible logic:** Make structural logic explicit. Use physical connectors for flows; use geometric shapes (pyramids, concentric circles, etc.) for hierarchies.

### 3. Premium Texture

- **Rich information presentation:** Information blocks should be content-rich and designed — incorporating numbering, titles, charts, viewpoints, annotations, and key messages.
- **High-quality design elements:** Freely use background decorations, borders, shadows, gradients, and frosted-glass effects to elevate visual quality.
- **Reject cheapness:** Using only simple flat backgrounds and plain icon cards is strictly forbidden.

### 4. Atmospheric Decoration

- **Elegant background accents:** Use geometric fragments, subtle textures, grids, or dark patterns (drawn via SVG) to enrich background quality.
- **Dynamic text rhythm:** Create reading rhythm through color changes, gradients, background highlights, font-size variation, and `<span style={{...}}>` tags.
- **Reject monotony:** Blank pages with no decoration are strictly forbidden. Using a single font size, single color, and zero highlights throughout is strictly forbidden.

### 5. Theme Continuity

- **Global design system:** Maintain a consistent color palette and typographic system to ensure a unified style throughout.
- **Structural consistency:** All content-page titles must use the same layout and style (position, font size, color, alignment, etc.), and background styles should remain consistent.
- **Style unity:** All illustrations and icons must share a consistent style (if AI-generated images are used, the same style must be applied throughout).
- **Signature motif:** Repeat specific visual decoration elements across slides (e.g., a particular frosted-glass style or dot-grid pattern) to build brand memory.

---

## CRAP Principles

### Contrast
- Reject the lukewarm. Large text must be very large, small text very fine; dark must be very dark, gray very light.
- Create visual impact through dramatic contrast.
- Text/background contrast ratio ≥ 4.5:1 (WCAG AA)
- Use accent colors sparingly — 1 primary accent per slide

### Repetition
- Unify the visual language. Corner radii, shadow depths, and stroke widths must be strictly consistent throughout.
- Consistent color palette across all slides
- Same font pairing throughout: major font for headings, minor for body

### Alignment
- Enforce pixel-perfect alignment. All spacing must be multiples of 8 (8, 16, 24, 32, 48, 64).
- Arbitrary values like 10px or 15px are strictly forbidden.
- All text left-aligned; headings and body text strictly left-aligned.
- Use `justifyContent` and `alignItems` consistently

### Proximity
- Physical distance = logical distance
- Related items: 8–16px gap; unrelated items: 32–48px gap
- Content density ≤ 7 items per slide

---

## Typography Scale

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Display | 56–72 px | Bold (800) | Cover main title |
| Heading 1 | 40–48 px | Bold | Chapter title |
| Heading 2 | 28–36 px | SemiBold | Page title |
| Heading 3 | 22–26 px | SemiBold | Sub-title |
| Body | 16–20 px | Regular | Body text |
| Caption | 12–14 px | Regular | Annotations, footnotes |

### Typography Principles

1. **Extreme hierarchical contrast:** Reject gentle, incremental size reductions — establish a clear reading path through significant scale differences.
2. **Readability at a distance:** Use generous line height (`lineHeight: 1.5–1.6`) and generous paragraph spacing.
3. **Strength:** Use extra-bold weight (`fontWeight: 800`) for core arguments.
4. **Refinement:** Sub-headings may use all-caps combined with letter spacing (`letterSpacing`).
5. **De-emphasis technique:** Use color opacity rather than reducing font size to handle secondary information.
6. **Dynamic emphasis marking:** Core keywords must be highlighted using a flexible combination of `color`, `fontWeight`, `backgroundColor`, and `borderBottom` inside `<span style={{...}}>`.

---

## Color Palettes

### Professional Dark
```
dk1: "#1a1a2e"    lt1: "#f5f5f5"    accent1: "#4e79a7"
accent2: "#f28e2b" accent3: "#59a14f" accent4: "#e15759"
```

### Modern Light
```
dk1: "#2d3436"    lt1: "#ffffff"    accent1: "#6c5ce7"
accent2: "#00cec9" accent3: "#fd79a8" accent4: "#fdcb6e"
```

### Corporate Blue
```
dk1: "#1e3a5f"    lt1: "#f8f9fa"    accent1: "#2563eb"
accent2: "#3b82f6" accent3: "#60a5fa" accent4: "#93c5fd"
```

---

## Layout Patterns

### A — Title + Subtitle (Cover)
Full-center layout with large title and smaller subtitle. Cover slides must meet a "movie poster" standard of composition.

### B — Title + Body
Top title bar + content area below. Keep the title bar height restrained to leave more space for content.

### C — Two Column
50/50 or 60/40 split for comparison or text + image.

### D — Three Column
Equal thirds for feature lists or comparison matrices.

### E — Card Grid
2×2 or 3×2 grid using `flexWrap` + percentage `width` (CSS Grid is forbidden).

### F — Full Image + Overlay
Full-bleed image with text overlay using a semi-transparent Box with `backdrop-filter: blur()`.

### G — Magazine Layout
Hero visual + sidebar + two cards in a magazine-style arrangement (see Box component layout examples).

---

## CSS Capability Boundaries

### ✅ Supported (use freely)
- Full Flexbox suite (`flex`, `gap`, `flexWrap`, `alignItems`, `justifyContent`)
- Gradients (`linearGradient`, `radialGradient`)
- Shadows (`boxShadow`, `textShadow`)
- Frosted glass (`backdrop-filter: blur()`)
- Transforms (`transform`, `rotate`, `scale`)
- Border radius (`borderRadius`)
- Opacity (`opacity`)
- Absolute positioning (`position: 'absolute'`)
- Text effects (`letterSpacing`, `lineHeight`, `textTransform`, `background-clip: text`)

### ❌ Forbidden
- `display: 'grid'` or any grid-related properties
- `calc()` function
- `table` layout

---

## 3-Second Rule

Every slide must communicate its main point within 3 seconds:
1. One clear focal point (largest element)
2. Supporting information at smaller scale
3. Remove everything that doesn't support the message

**Test standard:** Squint at the slide — the visual center of gravity (the largest, darkest element) must be the core argument of that page.
