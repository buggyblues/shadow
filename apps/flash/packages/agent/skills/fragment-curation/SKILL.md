---
name: fragment-curation
description: Knowledge card deduplication, classification, linking, and prioritization — elevating raw fragment cards into a high-quality knowledge library.
version: 3.0.0
metadata:
  openclaw:
    emoji: "🗂️"
---

# Fragment Curation Skill — Card Organization & Optimization

Deduplicate, classify, link, and prioritize raw cards produced by material-analysis or curate, resulting in a high-quality knowledge library.

> **📋 Data Structure Standard**: Curated cards must conform to `packages/types/src/card.ts`. Refer to `SCHEMA-GUIDE.md` for the required field quick-reference by kind.

## When to Use

Activate this skill when:
- A curate step has produced a large volume of cards that need deduplication and refinement
- Multiple rounds of material analysis have generated overlapping content
- Semantic links between cards need to be established

---

## Curation Workflow

### Step 1: Deduplication — Last Line of Defense

**Upstream skills (curate/research, etc.) have already run Anti-Duplication checks, but stragglers may remain. This step is the final safety net.**

#### 1a. Handle `action` markers
- Cards in the input array that already carry an `action` marker (`"create"` / `"enrich"`):
  - `"create"` → process normally
  - `"enrich"` → this is a supplement instruction; pass it downstream as-is — do not treat it as a new card
- **Cards without an `action` marker** (may be historical data) → treat as already-confirmed cards

#### 1b. Deduplication among `create` cards
- Compare `create` cards by content similarity (compare `title` + kind-specific field data)
- Merge duplicates: keep the richer version and absorb unique information from the other
- Retain multiple `sourceId`s when merging (record in `meta`)
- **Data cards:** If two `data` cards share overlapping `metrics`, merge them into one more complete card

#### 1c. Deduplication of `create` cards against existing cards
- If the caller passed in `<existing-cards>` (existing card summaries), re-check whether any `create` cards duplicate existing ones
- On detection → convert to `"action": "enrich"` or remove entirely

### Step 2: Classification Validation
Verify that each card has the correct `kind` and that its kind-specific fields are populated:

| kind | Criteria | Required fields |
|------|----------|----------------|
| `quote` | Complete quotation + attribution | `text` |
| `summary` | Distilled overview of a section or topic | `body` |
| `argument` | Explicit claim + supporting evidence | `claim`, `evidence[]` |
| `data` | Numerical fact, statistic, or percentage | `metrics[]` |
| `table` | Tabular data (row/column structure) | `columns[]`, `rows[]` |
| `image` | Visual content + description | `description` |
| `code` | Code snippet + context | `language`, `code` |
| `chart` | Renderable chart data | `chartType`, `categories[]`, `series[]` |
| `idea` | Creative insight or inspiration | `body` |
| `keypoint` | Key takeaway or core finding | `points[]` |
| `definition` | Term definition or concept explanation | `term`, `definition` |
| `example` | Concrete case or illustrative example | `subject`, `scenario` |
| `reference` | Source attribution | `refTitle` |
| `timeline` | Chronologically ordered events | `events[]` |
| `comparison` | Side-by-side comparison of subjects | `subjects[]`, `dimensions[]` |
| `process` | Steps or workflow | `steps[]` |

**If a card's `kind` does not match its kind-specific fields, correct the `kind` or fill in the missing fields.**

### Step 3: Bidirectional Linking
Establish semantic links between cards:

| Link Type | Description |
|-----------|-------------|
| **Same topic** | Cards discussing the same subject |
| **Supporting evidence** | A `data` card supports an `argument` card |
| **Contrast / opposition** | Cards presenting opposing viewpoints |
| **Prerequisite knowledge** | A `definition` card explains a term used by other cards |
| **Source chain** | A `quote` card linked to its context / `summary` card |
| **Data association** | `data` + `chart` + `table` cards describing the same dataset |

**Linking rules:**
- Links **must be bidirectional**: if card-A → card-B, then card-B → card-A
- 0–5 links per card (avoid over-linking)
- Prioritize strong semantic links

### Step 4: Priority Assignment

| priority | Criteria | Examples |
|----------|----------|---------|
| `high` | Core argument, key data, striking quote, major finding | Paradigm-shifting data, core conclusion |
| `medium` | Case study, definition, supporting evidence, code snippet | Supplementary explanation, illustrative example |
| `low` | Background reference, supplementary text, peripheral info | Source attribution, minor detail |

### Step 5: Tag Optimization
Add 1–5 tags to each card:

- **Topic tags:** Content subject (e.g., `AI`, `revenue`, `architecture`)
- **Role tags:** Function in the presentation (e.g., `opener`, `evidence`, `conclusion`)
- **Quality tags:** `must-use`, `optional`, `backup`

### Step 6: Source Traceability
- Every auto-generated card **must** have a `sourceId` pointing to the original material
- Record the source location in `meta` (e.g., `{ "source": "page 3, paragraph 2" }`)

---

## Output Format

Produce a curated JSON array containing two element types:

1. **Complete new cards with `"action": "create"`** — deduplicated, validated, and linked cards
2. **Supplement instructions with `"action": "enrich"`** — additional information for existing cards

```json
[
  {
    "action": "create",
    "id": "card-001",
    "kind": "quote",
    "title": "Innovation Distinguishes Leaders from Followers",
    "summary": "Steve Jobs' classic quote on innovation and leadership",
    "sourceId": "mat-001",
    "linkedCardIds": ["card-003", "card-005"],
    "tags": ["innovation", "leadership", "opener", "must-use"],
    "priority": "high",
    "autoGenerated": true,
    "rating": 5,
    "meta": { "source": "page 1, introduction", "confidence": 0.95 },

    "text": "Innovation distinguishes between a leader and a follower.",
    "author": "Steve Jobs",
    "role": "Co-founder, Apple",
    "source": "2005 Stanford Commencement Speech",
    "language": "en",
    "emphasis": ["Innovation", "leader", "follower"]
  },
  {
    "action": "create",
    "id": "card-002",
    "kind": "data",
    "title": "Revenue Breaks $10B in 2024",
    "summary": "Full-year revenue reached $10.3B, up 23% year-over-year",
    "sourceId": "mat-001",
    "linkedCardIds": ["card-003"],
    "tags": ["revenue", "growth", "must-use"],
    "priority": "high",
    "autoGenerated": true,
    "rating": 5,
    "meta": { "source": "page 5, table 1" },

    "metrics": [
      { "key": "Annual Revenue", "value": 10.3, "unit": "B USD", "change": "+23%", "changeDirection": "up" },
      { "key": "Net Profit", "value": 1.52, "unit": "B USD", "change": "+31%", "changeDirection": "up" }
    ],
    "period": "FY 2024",
    "benchmark": "vs. FY 2023",
    "highlight": "Annual Revenue",
    "visualHint": "kpi-grid"
  },
  {
    "action": "enrich",
    "targetCardId": "card-existing-005",
    "enrichFields": {
      "metrics": [
        { "key": "International Revenue", "value": 2.8, "unit": "B USD", "change": "+45%", "changeDirection": "up" }
      ]
    },
    "reason": "Existing card covers total revenue; this update adds the international segment breakdown"
  }
]
```

---

## Quality Checklist

Verify each item before finalizing the curation:

- [ ] **No duplicate cards** (deduplication among `create` cards + against `existingCards`)
- [ ] Every `enrich` instruction's `targetCardId` points to a real existing card
- [ ] Every output element has an `action` field (`"create"` or `"enrich"`)
- [ ] Every card has a correct `kind`
- [ ] **Every card's kind-specific fields are populated** (`data` has `metrics`, `chart` has `series`, `table` has `columns`/`rows`)
- [ ] Every auto-generated card has a `sourceId`
- [ ] Linked cards are bidirectionally connected
- [ ] Priority reflects presentation impact
- [ ] Tags support effective filtering
- [ ] Every card's `summary` is concise and readable
- [ ] High-rated cards (★4–5) are tagged `must-use`
