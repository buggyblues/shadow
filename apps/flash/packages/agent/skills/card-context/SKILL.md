---
name: card-context
description: Knowledge card → PPT visualization mapping spec — guides the generate phase on how to read card data to build precise visualization pages.
version: 4.0.0
metadata:
  openclaw:
    emoji: "🃏"
---

# Card Context Skill — Card Data → PPT Visualization

This skill defines how to correctly use **structured data** from knowledge cards during PPT generation to create precise visualization pages.

**Card data format is detailed in the curate SKILL (v4) and `packages/types/src/card.ts`. Card specialized fields are placed directly at the top level — no `content`, no `structured` wrapper.**

> **📋 Data Structure Standards**: When reading cards, reference field paths in the `SCHEMA-GUIDE.md` quick reference.

## When to Use

Activate this skill when:
- The generate phase needs to create PPT content from outline + cards
- Any scenario requiring card content to be rendered onto slides

---

## ⚠️ Core Directive

**Card specialized fields (metrics / series / columns / rows / text / claim / points / events / steps / ...) are the source of truth. Read them directly, use them directly. Do not compose replacement content yourself.**

### Rendering Priority

```
Card specialized fields (exact rendering) > summary field (fallback text) > self-composed (❌ prohibited)
```

---

## Card Rating & Display Rules

| Rating (★) | Content Display Strategy | Requirement |
|-----------|--------------------------|-------------|
| ★4–5 | **Full presentation** | Cannot be abbreviated; core data/content must be fully displayed |
| ★3–3.5 | Show core content | Extract key info, retain data and conclusions |
| ★1–2.5 | Simplified display | Only the most critical information points |

### Special Handling for High-Rated Cards

★4–5 cards are the core assets of the entire presentation:
1. **Assign to important pages** — don't hide them in inconspicuous locations
2. **Visual prominence** — larger font size, more prominent colors, dedicated display area
3. **Non-compressible** — even with tight page space, core content cannot be reduced
4. **Cross-reference** — content-rich cards can reference different parts on multiple pages

---

## Card Meta Format (provided by caller)

```
- [{kind}] {id}: "{title}" ★{rating} {priority} — {summary} [linked: {linkedCardIds}] #{tags}
```

**Priority markers**:
- 🔴 High = `high` — must use
- 🟡 Medium = `medium` — recommended
- No marker = `low` — use as needed

---

## Kind → Visualization Mapping

### `data` → Data Visualization

**Read `metrics` array directly, choose presentation based on `visualHint`:**

| visualHint | Presentation | Strategy |
|-----------|-------------|---------|
| `big-number` | Extra-large font for the most important metric | Find metric matching `highlight`, fontSize 72–96 display |
| `kpi-grid` | Multi-metric grid cards | One card per metric, key/value/unit/change layout |
| `comparison` | Before/after comparison | Two-column layout + arrows + change annotation |
| `trend` | Trend suggestion | Large number + background trend line decoration |
| undefined / default | Auto based on metrics count | 1→big-number, 2–4→kpi-grid, 5+→table |

**Reading:**
- `card.metrics` → metrics array
- `card.metrics[i].key` → metric name
- `card.metrics[i].value` → value
- `card.metrics[i].unit` → unit
- `card.metrics[i].change` → change magnitude
- `card.metrics[i].changeDirection` → `"up"` / `"down"` / `"neutral"`
- `card.period` → time period
- `card.benchmark` → comparison baseline
- `card.highlight` → highlighted metric key

---

### `chart` → Chart Component

**Directly map card fields to Chart component properties:**

```
card.chartType → Chart.chartType
card.categories + card.series → Chart.data (2D array)
card.insight → insight text below chart
```

**Mapping rules:**
- `card.chartType` = `"barChart"` / `"lineChart"` / `"areaChart"` / `"pieChart"`
- `card.categories` = X-axis categories
- `card.series[].name` = series name
- `card.series[].data` = value array
- Chart data format: `[[xLabel, s1.name, s2.name], [cat1, s1.data[0], s2.data[0]], ...]`

---

### `table` → Table Component

**Build Table directly from `columns` and `rows`:**

```
card.columns → headers (label as header text)
card.rows → data rows (values by column.key)
card.columns[i].type → formatting (percent→add%, currency→add$, number+unit→add unit)
card.highlightRow → highlighted row
card.caption → table title
```

---

### `quote` → Large Quote Typography

**Use `text` + `author` + `role` + `emphasis` directly:**

```
card.text → quote body (large centered text)
card.emphasis[] → highlighted keywords (use span with color/bold)
card.author → author (below quote)
card.role → author title (appended to author)
card.source → source (small annotation)
```

---

### `argument` → Claim + Evidence Structured Layout

```
card.claim → core argument (large title)
card.evidence[] → evidence list (each with type icon + text + source)
card.counterpoint → counter-point (warning color block)
card.strength → argument strength indicator
```

**evidence.type icon mapping:**
- `"statistic"` → chart-bar
- `"example"` → lightbulb
- `"expert"` → user-tie
- `"trend"` → arrow-trend-up
- `"analogy"` → arrows-left-right

---

### `keypoint` → Key Point Grid/List

```
card.points[] → key point cards (each with label + detail + icon)
card.context → background description
card.layout → "horizontal" / "vertical" / "grid"
```

---

### `example` → Case Study Display

```
card.subject → case subject title (large text)
card.industry → industry label
card.challenge → challenge (red border block)
card.approach → approach (green border block)
card.results[] → result KPI cards (metric + value)
card.takeaway → insight (highlighted summary)
```

---

### `timeline` → Timeline

```
card.events[] → time nodes (date + title + detail + significance)
card.direction → "horizontal" / "vertical"
card.span → time span annotation
```

**significance visual differentiation:**
- `"high"` → theme color dot, bold title
- `"medium"` → normal dot
- `"low"` → semi-transparent dot

---

### `comparison` → Comparison Display

```
card.subjects[] → comparison subject names (column headers / area titles)
card.dimensions[] → comparison dimensions (each row with label + values[] + winner)
card.conclusion → comparison conclusion
card.visualHint → "versus" (left-right VS) / "matrix" (matrix table) / "radar" (radar chart)
```

**winner marking:** `dimensions[i].winner` is an index corresponding to which subject in `subjects` wins — winner gets bold + green.

---

### `process` → Flow Diagram

```
card.steps[] → step nodes (order + label + detail + icon)
card.isLinear → true (arrow-connected) / false (branching flow)
card.visualHint → "arrow-flow" / "numbered-list" / "swimlane"
```

---

### `code` → CodeBlock

```
card.code → CodeBlock.code
card.language → CodeBlock.language
card.filename → filename annotation
card.highlight → highlighted line numbers
card.description → code description text
```

---

### `definition` → Terminology Card

```
card.term → term name (large title)
card.abbreviation → abbreviation annotation
card.definition → definition body (quoted style border)
card.relatedTerms[] → related terms tags
card.example → example description
```

---

### `summary` / `idea` → Text Type

```
card.body → body text (Markdown rendered)
```

- `summary` → paragraph text, keywords can be highlighted
- `idea` → lightbulb icon + creative description card

---

### `image` → Image Display

```
card.filePath → Image component src
card.description → image caption
card.altText → accessibility text
card.labels[] → annotation text (overlaid on image or listed as captions)
```

---

### `reference` → Footer Annotation

```
card.authors[] → authors
card.refTitle → reference title
card.publishDate → publication date
card.url → link
card.refType → type label
card.credibility → credibility indicator
```

Generally used as small-text footnotes on other pages, not standalone pages.

---

## Usage Principles

1. Every card referenced in `cardRefs` **must** be used on the corresponding page
2. **Read card specialized fields directly** — data is at the top level, no need to look for `.structured`
3. High-rated cards (★4–5) content **must not be abbreviated or omitted**
4. **`data` card metrics must use data visualization** — don't convert numbers to text sentences
5. **`chart` cards must be rendered as Chart components** — don't describe charts in text
6. **`table` cards must be rendered as Table components** — don't list table data in text
7. **`quote` card emphasis keywords must be highlighted**
8. **Must not replace card data with self-composed content**
9. Card `linkedCardIds` can be used to combine related content on the same page
10. When a page references multiple cards, ensure logical arrangement and visual hierarchy
11. Card `tags` can be used to choose color scheme and icon style

---

## ❌ Common Errors

| Error | Correct Approach |
|-------|----------------|
| `data` card written as text sentence "Revenue grew 23%" | Read `card.metrics`, display with large text/KPI grid |
| `chart` card describes trend in text | Read `card.series` + `card.categories`, map to Chart component |
| `table` card lists data in bullet points | Read `card.columns` + `card.rows`, map to Table component |
| `quote` card ignores emphasis highlights | Read `card.emphasis[]`, highlight with span |
| Ignoring card data, composing own copy | Strictly use card field data |
| Shrinking a ★5 quote to a one-line footnote | Give it a prime centered large-text display |
| Using identical layout for all cards | Choose the best visualization for each kind |
| `comparison` card only written as text description | Read `card.subjects` + `card.dimensions` for VS layout |
| `timeline` card becomes paragraph text | Read `card.events` for timeline component |
| `process` card becomes numbered list | Read `card.steps` for arrow flow diagram |
| Trying to access `card.content` or `card.structured` | These fields don't exist; read top-level specialized fields directly |
