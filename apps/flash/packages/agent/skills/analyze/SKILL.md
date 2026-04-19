---
name: analyze
description: Generate structured PPT outlines from materials and knowledge cards — intelligently arrange page structure and card references.
version: 3.0.0
metadata:
  openclaw:
    emoji: "🧠"
---

# Analyze Skill — Materials + Cards → Outline

Given materials and knowledge cards, generate a structured PPT outline providing a high-quality page blueprint for the subsequent generate phase.

> **📋 Data Structure Standards**: The outline must conform to `SCHEMA-GUIDE.md`. Consult `SCHEMA-GUIDE.md` for outline item required fields.

## When to Use

Activate this skill when:
- The user has finished curating materials and needs to generate a PPT structure
- The user asks to "generate an outline", "plan the structure", or "analyze content"
- Scattered knowledge cards need to be organized into a logical presentation structure

---

## Page Types

| type | Purpose | Design Requirements |
|------|---------|---------------------|
| `cover` | Cover — title + subtitle | "Movie poster" level composition, large text + visual impact |
| `toc` | Table of contents — content overview | Clear section list with numbering |
| `section` | Section divider | Concise and powerful section title, transition feel |
| `content` | Main content page | Magazine-level layout, moderate information density |
| `chart` | Chart/data visualization page | Data-centric, chart + interpretation |
| `image` | Image showcase page | Visual-centric, image + brief caption |
| `quote` | Key quote page | Large centered text, striking impact |
| `ending` | Ending/acknowledgment page | Clean close, call to action |

---

## Output Method

The caller will indicate the outline file path in the prompt. Path format follows the v8 file structure:

```
/data/projects/<projectId>/ai-output/outline.json
```

**You MUST use the `write` tool to write the complete outline JSON array to that file.** This is the only output method.

### Output Rules

- **Do not** output JSON code blocks in conversation
- **Do not** output the outline page by page
- Write the complete JSON array to the specified path in one call
- The server monitors `ai-output/` via file-watcher and will read and push your output immediately

**Format requirement**: File content must be a valid JSON array, e.g. `[{...}, {...}, ...]`.

---

## Outline Data Structure

Each outline item structure:

```json
{
  "id": "slide-001",
  "slideIndex": 0,
  "title": "Disruptive Growth: 2024 Revenue Breaks $10B",
  "type": "cover",
  "keyPoints": [
    "Full-year revenue up 23% YoY, surpassing $10B",
    "All three business lines achieve profitability"
  ],
  "materialRefs": ["mat-001"],
  "cardRefs": ["card-001", "card-005"],
  "notes": "Cover uses dark theme + data impact, full-screen background image",
  "layoutHint": "full-image-overlay"
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique ID, format `slide-<index>` |
| `slideIndex` | ✅ | Page index (starting from 0) |
| `title` | ✅ | Page title (**McKinsey assertion title**: must be a powerful, complete conclusion) |
| `type` | ✅ | One of the page types above |
| `keyPoints` | ✅ | Key points array (core information to present on this page, 3–5 items) |
| `materialRefs` | ✅ | Material ID array |
| `cardRefs` | ✅ | Card ID array (references to existing knowledge cards) |
| `notes` | ✅ | Design notes (layout hints for the generate phase) |
| `layoutHint` | — | Layout hint (optional, suggested layout pattern) |

### Layout Hints (layoutHint)

| Value | Corresponding Layout |
|-------|---------------------|
| `title-subtitle` | Cover: large title + subtitle centered |
| `full-image-overlay` | Full-screen background image + semi-transparent text overlay |
| `two-column` | Two-column layout (50/50 or 60/40) |
| `three-column` | Three equal columns |
| `card-grid` | 2×2 or 3×2 card grid |
| `magazine` | Magazine layout (main visual + sidebar + dual cards) |
| `chart-focus` | Chart-centric + data interpretation |
| `quote-center` | Quote centered in large text |

---

## Card → Page Type Mapping

v4 card specialized fields are directly at the top level. During outline planning, understand each kind's data characteristics for optimal page assignment:

| Card kind | Recommended page type | Data characteristics & notes hints |
|-----------|-----------------------|-------------------------------------|
| `quote` | `quote` | card.text large centered, card.emphasis highlights keywords |
| `data` | `chart` | card.metrics as KPI visualization, card.visualHint guides layout |
| `chart` | `chart` | card.series + card.categories directly mapped to Chart component |
| `table` | `content` or `chart` | card.columns + card.rows mapped to Table component |
| `code` | `content` | card.code + card.language as CodeBlock, notes indicate "code display" |
| `image` | `image` | card.filePath as Image component, card.labels as annotations |
| `argument` | `content` | card.claim as title, card.evidence as evidence list |
| `keypoint` | `content` | card.points as key point grid, card.layout guides arrangement |
| `summary` | `content` or `section` | card.body as summary text |
| `example` | `content` | card.subject as case title, card.results as KPIs |
| `idea` | `content` | card.body as creative display |
| `timeline` | `content` | card.events as timeline, card.direction guides orientation |
| `comparison` | `content` | card.subjects + card.dimensions as VS comparison layout |
| `process` | `content` | card.steps as flow diagram, card.isLinear guides style |
| `definition` | `content` | card.term + card.definition as terminology card |
| `reference` | — (supplementary) | Generally used as footnotes on other pages, not standalone |

---

## Outline Structure Standards

### Basic Structure

Generate **5–12 pages**, following standard narrative structure:

```
Cover (cover)
 └→ [Table of Contents (toc)] — optional, recommended for ≥8 pages
     └→ Section Divider (section) — optional
         └→ Content Pages (content/chart/image/quote) × N
             └→ [Section Divider (section)] — next section
                 └→ Content Pages × N
                     └→ Ending (ending)
```

### Narrative Logic

The outline must have clear narrative logic:
1. **Opening hook** — the cover must be compelling, the title must be impactful
2. **Problem → Solution → Evidence** — classic SCR (Situation-Complication-Resolution) structure
3. **Progressive buildup** — from background to analysis to conclusion, increasing information density
4. **Climax toward the end** — the most striking data or conclusion goes in the middle-to-late section
5. **Strong closing** — ending page should have a call to action or memorable quote

---

## Core Principles

1. **cardRefs reference existing card IDs** — every page must reference relevant cards, no empty references
2. **Prioritize high priority and high-rated cards** — ★4–5 cards should appear on important pages
3. **Title is the conclusion** — every page title must be a powerful complete assertion, not a label like "Revenue Data"
4. `quote` cards → assigned to `quote` type pages
5. `data` / `chart` cards → assigned to `chart` type pages
6. `code` cards → assigned to `content` pages with "code display" noted
7. If the user provides TODO requirements, they must be reflected in the outline
8. If an existing outline (existingOutline) is provided, optimize it rather than rewriting
9. **Every high-rated card must be referenced by at least one page** — don't waste ★4–5 quality content
10. **`notes` field must be detailed** — include layout suggestions and explanation of referenced card fields (e.g. "use card-001.metrics as KPI grid")

---

## Quality Checklist

Confirm before writing:
- [ ] Cover title is impactful
- [ ] Every page title is a McKinsey assertion
- [ ] All ★4–5 cards are referenced
- [ ] Narrative structure is clear (problem → solution → evidence → conclusion)
- [ ] Page type assignments are appropriate (data→chart, quotes→quote)
- [ ] `notes` field contains useful design hints, **specifying which card fields to read**
- [ ] JSON format is valid (array wrapper)
- [ ] Page count is between 5 and 12
