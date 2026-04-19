---
name: smart-summary
description: Intelligently summarize long documents and multi-material sets, producing condensed structured content — core information compression capability.
version: 2.0.0
metadata:
  openclaw:
    emoji: "📄"
    category: utility
---

# Smart Summary Skill

Produce structured summaries of long texts or multiple materials, achieving efficient condensation while preserving information completeness.

> **📋 Data Structure Standard**: Output cards must conform to the TypeScript types in `packages/types/src/card.ts`. Consult `SCHEMA-GUIDE.md` for required field quick reference and self-check checklist.

## When to Use

The caller activates this skill when:
- The user uploads a long document (>2000 words) and needs a quick grasp of the core content
- Multiple materials need a consolidated summary
- Pre-processing before curate — quickly understanding the full scope of materials

---

## Summary Levels

Use a three-tier progressive summary structure:

### Level 1: One-liner
- Condense core information into **one sentence** (≤50 words)
- Format: `[Subject] + [core action/conclusion] + [key data/result]`
- Example: *"Netflix's AI personalization recommendation system raised user retention to 93%, saving $1B annually in content costs."*

### Level 2: Key Points
- Extract the **3–5 most important** information points
- 1–2 sentences per point
- List in **descending order of importance**
- Each point should be independently understandable

### Level 3: Structured Summary
- Detailed summary organized by theme
- Each theme includes: title + core content + key data
- Preserve key data and quotations from the original
- Total length should not exceed **20–30%** of the original

---

## Summary Principles

### Fidelity

| Principle | Requirement |
|-----------|-------------|
| **Faithful to source** | Do not add viewpoints or inferences not present in the original |
| **Preserve data** | All key data must be retained — do not round or approximate |
| **Maintain stance** | Convey the author's attitude; do not substitute with neutral phrasing |
| **Annotate uncertainty** | Mark inferences as "implied by source" or "inferred from context" |

### What to Keep vs. Drop

| Keep | Drop |
|------|------|
| Core arguments and conclusions | Transitional sentences and repeated arguments |
| Key data and percentages | Redundant illustrative examples |
| Author's original viewpoints | Background common knowledge |
| Specific action recommendations | Vague outlook statements |
| Quantified outcome metrics | Subjective impressions without data |

---

## Multi-Material Consolidated Summary

When processing multiple materials, add the following steps:

### 1. Per-Material Summary
- Execute the three-level summary for each material independently

### 2. Cross-Analysis
- **Consensus**: Viewpoints consistently endorsed across multiple materials
- **Divergence**: Contradictions or inconsistencies between materials
- **Complementarity**: Information present in A but absent in B

### 3. Consolidated Conclusion
- Integrate the core information from all materials
- Note the coverage and credibility of the information
- Identify **information gaps** (directions that require further research)

---

## Anti-Duplication (Required)

The caller will pass a concise summary of existing cards via `<existing-cards>` tags. **Before producing any cards, compare each candidate against existingCards one by one**:

- An existing summary/keypoint card already covers the same summary content → **skip**
- An existing card covers the same topic but this summary adds more comprehensive points → output `"action": "enrich"` supplement
- A summary of a completely new topic → output `"action": "create"` new card

**Enrich example**:

```json
{
  "action": "enrich",
  "targetCardId": "card-005",
  "enrichFields": {
    "body": "Updated with additional key points: edge AI will account for 40%+ of total inference volume by 2025; data sovereignty regulations are forcing enterprises to adopt hybrid cloud AI architectures",
    "tags": ["edge-AI", "data-sovereignty"]
  },
  "reason": "card-005 already has the core summary of this report; supplementing missed important points"
}
```

**Every output must include an `action` field.**

---

## Output Specification

Produce knowledge cards. Recommended types:

| kind | Purpose | Count |
|------|---------|-------|
| `summary` | Consolidated summary (Level 3) | 1–2 |
| `keypoint` | Key points (Level 2) | 2–4 |
| `quote` | Excellent original text expressions | 0–2 |
| `data` | Key data points (single metric) | 0–2 |
| `table` | Tables or multi-dimensional comparison data from source | 0–2 |
| `chart` | Trend data from source (≥3 time points) | 0–1 |
| `timeline` | Key time-ordered events from source | 0–1 |

### Kind Upgrade Rules (Hard)

The following scenarios **must** use the higher-order card type — **downgrading to `data` or `summary` is prohibited**:

| Data characteristic | Must use kind | Prohibited downgrade |
|--------------------|--------------|---------------------|
| Source contains ≥3 time-point data | `chart` | ~~`data` (listing each time point in metrics)~~ |
| Source contains a row-column table | `table` | ~~`summary` (text description of table)~~ |
| Source has ≥4 time-ordered events | `timeline` | ~~`summary` (narrating by time)~~ |

### Summary Card Template

```json
{
  "action": "create",
  "id": "card-010",
  "kind": "summary",
  "title": "Enterprise AI Adoption — Consolidated Summary",
  "summary": "Enterprise AI has moved from pilot to scale, but 65% still face data and talent bottlenecks",
  "sourceId": "mat-001",
  "linkedCardIds": [],
  "tags": ["AI", "enterprise", "summary", "trend"],
  "priority": "high",
  "autoGenerated": true,
  "rating": 5,
  "meta": {
    "summaryLevel": "L3-structured",
    "sourceCount": 3,
    "wordReduction": "Original 8500 words → Summary 450 words (5.3%)",
    "informationCoverage": 0.85,
    "gaps": ["Missing China enterprise AI data", "Missing SME perspective"]
  },
  "body": "Enterprise AI adoption has moved from pilot to scale, but 65% of companies still face dual bottlenecks of data quality and talent shortage.\n\n**Key Points:**\n1. **Adoption**: 72% of enterprises have deployed at least one AI application, up 18pp vs 2022 (McKinsey)\n2. **ROI gap**: Top 20% achieve 15–25% AI ROI; bottom 40% have not turned positive\n3. **Barriers**: Data quality (65%), talent shortage (58%), organizational resistance (42%)\n4. **Trend**: GenAI investment share jumped from 8% in 2023 to 28% in 2024\n5. **Risk**: AI ethics and regulatory compliance have become board-level topics; 47% of enterprises have established AI governance committees\n\n**Synthesis**: AI is transitioning from 'nice to have' to 'strategic necessity', but success depends not on the technology itself but on data infrastructure and organizational change capability."
}
```

---

## Quality Standards

- [ ] **Compared against existingCards — no duplicate summary cards**
- [ ] Every output includes `action` field (`"create"` or `"enrich"`)
- [ ] Three-level summary **structure complete** (one-liner + key points + structured summary)
- [ ] **Faithful to source** — no judgments not present in the original
- [ ] All key data **fully retained**
- [ ] Multi-material summary includes **cross-analysis**
- [ ] **Information gaps** are noted
- [ ] Summary length does not exceed 30% of original
