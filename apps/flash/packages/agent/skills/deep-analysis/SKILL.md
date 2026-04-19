---
name: deep-analysis
description: Perform multi-layered deep analysis of a topic, uncovering core logic and hidden relationships — the deep-analysis angle of the research skill.
version: 2.0.0
metadata:
  openclaw:
    emoji: "🔬"
    category: research
---

# Deep Analysis Skill

Conduct multi-layered deep analysis of a given topic, progressing from surface phenomena to underlying logic, and uncovering core insights.

> **📋 Data Structure Standard**: Output cards must conform to `packages/types/src/card.ts`. Refer to `SCHEMA-GUIDE.md` for required field quick reference and self-check checklist.

## When to Use

Called as a sub-angle of the research skill, or used independently when:
- A complex topic requires thorough interpretation
- Cause-and-effect relationships behind phenomena need to be uncovered
- Hidden contradictions and trends need to be identified

---

## Five-Layer Analysis Framework

### Layer 1: Surface Analysis
Directly observable facts, data, and viewpoints

- **What is it?** — Define and scope the topic
- **What is the current state?** — Current status and key metrics
- **Who is involved?** — Key stakeholders

**Output**: Factual description, data overview

### Layer 2: Causal Analysis
Cause-and-effect chains between elements

- **Why is this happening?** — Direct causes
- **What causes the causes?** — Root causes (5 Whys method)
- **What factors influence each other?** — Causal network

**Output**: Causal relationship map, key driving factors

### Layer 3: Structural Analysis
Underlying system structure and operating mechanisms

- **How does the system work?** — Core mechanisms
- **Where are the key leverage points?** — Highest-impact intervention points
- **What feedback loops exist?** — Positive/negative feedback cycles
- **How is value distributed?** — Who captures the most value

**Output**: System structure model, leverage point identification

### Layer 4: Contradiction Analysis
Internal contradictions and tensions

- **What is the core contradiction?** — Primary opposing forces
- **Short-term interest vs. long-term interest?** — Temporal dimension tension
- **Local optimum vs. global optimum?** — Spatial dimension tension
- **Innovation vs. stability?** — Change dimension tension

**Output**: Contradiction map, trade-off analysis

### Layer 5: Trend Analysis
Development directions and possible evolution

- **What happens short-term?** (1–2 years)
- **What happens mid-term?** (3–5 years)
- **What happens long-term?** (5–10 years)
- **What trends are irreversible?**
- **What variables remain uncertain?**

**Output**: Trend forecast, scenario analysis

---

## Analysis Toolbox

| Tool | Best For | Output Form |
|------|---------|------------|
| **PESTLE** | Macro environment analysis | Political / Economic / Social / Tech / Legal / Environmental |
| **Porter Five Forces** | Industry competition analysis | 5-forces model |
| **SWOT** | Holistic evaluation | Strengths / Weaknesses / Opportunities / Threats |
| **Value Chain** | Value chain analysis | Upstream / downstream value distribution |
| **5 Whys** | Root cause analysis | Cause-and-effect chain |
| **First Principles** | Fundamental thinking | Reasoning from basic facts |

---

## Anti-Duplication (Required)

The caller will pass existing card summaries via `<existing-cards>` tags in the prompt. **Before producing any card, compare against each existingCard**:

- An existing argument card already contains the same claim or insight → **Skip**
- An existing card covers the same argument but lacks deeper-layer analysis → Output `"action": "enrich"` to add evidence
- Entirely new insight or argument → Output `"action": "create"` for a new card

**Enrich example**:

```json
{
  "action": "enrich",
  "targetCardId": "card-015",
  "enrichFields": {
    "evidence": [
      "McKinsey 2024 report: companies that adopted AI outperformed industry average profit margins by 5–8 percentage points",
      "Contradicting this, MIT research shows 72% of AI projects never reached production"
    ],
    "tags": ["ROI-paradox"]
  },
  "reason": "card-015 already has the 'AI improves efficiency' claim; this enrichment adds deep evidence from both sides"
}
```

**Every output must include an `action` field.**

---

## Output Specification

Produce **3–6 knowledge cards**, recommended types:

| kind | Purpose |
|------|---------|
| `argument` | Core insight / claim (with multi-layer analytical support) |
| `keypoint` | Key finding / leverage point |
| `summary` | Synthesized analysis conclusion |
| `data` | Key data point discovered during analysis (single metric) |
| `table` | Multi-dimension comparative analysis (≥3 entities × ≥2 dimensions) |
| `chart` | Trend analysis data (≥3 time points or multi-series comparison) |
| `comparison` | In-depth A vs. B comparison |
| `process` | Causal chain / multi-step mechanism |

### Kind Upgrade Rules (Mandatory)

The following scenarios **must** use the higher-order card type — **downgrading is prohibited**:

| Data Characteristic | Required kind | Prohibited Downgrade |
|--------------------|--------------|----------------------|
| ≥3 time points in a trend | `chart` | ~~`data` (listing metrics per time point)~~ |
| ≥3 entities × ≥2 dimensions | `table` | ~~`data` (mixing different entities in metrics)~~ |
| Explicit A vs. B comparison | `comparison` | ~~`argument` (describing comparison in prose)~~ |
| Causal chain / multi-step mechanism | `process` | ~~`keypoint` (writing steps as a list)~~ |

### Deep Analysis Card Template

```json
{
  "kind": "argument",
  "title": "Root Cause of SaaS Growth Slowdown",
  "summary": "SaaS growth dropped from 25% to 14%; the core issue is that CAC has exceeded one-third of LTV",
  "tags": ["SaaS", "growth", "analysis", "business-model", "deep-analysis"],
  "priority": "high",
  "rating": 5,
  "meta": {
    "researchAngle": "Deep Analysis",
    "layers": ["surface", "causal", "structural", "contradiction", "trend"],
    "frameworks": ["Value Chain", "5 Whys"],
    "sources": ["Gartner SaaS Market Report 2024"]
  },

  "claim": "The core SaaS leverage point has shifted from 'acquisition-led growth' to 'retention-led efficiency'; when CAC exceeds 1/3 of LTV, growth becomes unsustainable",
  "evidence": [
    { "type": "statistic", "text": "Global SaaS market growth rate declined from 25% in 2021 to 14% in 2024", "source": "Gartner" },
    { "type": "trend", "text": "Three compounding factors: post-pandemic normalization + rising interest rates + market maturation", "source": "Gartner" },
    { "type": "statistic", "text": "Median CAC/LTV ratio for top 50 SaaS companies reached 0.38, exceeding the sustainability threshold", "source": "Gartner" },
    { "type": "example", "text": "Salesforce's 2023 mass layoffs are an extreme manifestation of the growth-vs-profitability contradiction", "source": "Public reporting" }
  ],
  "counterpoint": "AI-native SaaS may open a new growth curve, but requires 2–3 years of product maturation",
  "strength": "strong",
  "logicType": "inductive"
}
```

### Trend Analysis Card Template (chart)

```json
{
  "kind": "chart",
  "title": "SaaS CAC/LTV Ratio Deterioration Trend",
  "summary": "Median CAC/LTV for top 50 SaaS companies rose from 0.22 in 2020 to 0.38 in 2024, approaching the unsustainability threshold",
  "tags": ["SaaS", "CAC", "LTV", "trend", "deep-analysis"],
  "priority": "high",
  "rating": 5,
  "meta": {
    "researchAngle": "Deep Analysis",
    "layers": ["surface", "causal", "structural"],
    "frameworks": ["Value Chain"],
    "sources": ["Gartner SaaS Market Report 2024"]
  },

  "chartType": "lineChart",
  "categories": ["2020", "2021", "2022", "2023", "2024"],
  "series": [
    { "name": "CAC/LTV Median", "data": [0.22, 0.25, 0.30, 0.34, 0.38] },
    { "name": "Sustainability Threshold", "data": [0.33, 0.33, 0.33, 0.33, 0.33] }
  ],
  "unit": "",
  "xAxisLabel": "Year",
  "yAxisLabel": "CAC/LTV Ratio",
  "dataSource": "Gartner SaaS Market Report 2024",
  "insight": "CAC/LTV crossed the 0.33 sustainability threshold in 2023, confirming that the current growth model is unsustainable"
}
```

### Multi-Dimension Comparison Card Template (table)

```json
{
  "kind": "table",
  "title": "SaaS Growth Model: Three-Phase Comparison",
  "summary": "The SaaS industry has shifted from acquisition-driven to retention-driven growth; AI may unlock a third phase",
  "tags": ["SaaS", "growth-model", "comparison", "deep-analysis"],
  "priority": "high",
  "rating": 4.5,
  "meta": {
    "researchAngle": "Deep Analysis",
    "layers": ["structural", "trend"],
    "sources": ["Synthesized analysis"]
  },

  "columns": [
    { "key": "dimension", "label": "Dimension", "type": "text" },
    { "key": "phase1", "label": "Acquisition-Driven (2015–2021)", "type": "text" },
    { "key": "phase2", "label": "Retention-Driven (2022–2024)", "type": "text" },
    { "key": "phase3", "label": "AI-Driven (2025+)", "type": "text" }
  ],
  "rows": [
    { "dimension": "Core Metric", "phase1": "ARR Growth Rate", "phase2": "NDR (Net Dollar Retention)", "phase3": "AI Feature Penetration" },
    { "dimension": "Growth Rate", "phase1": "25%+", "phase2": "14%", "phase3": "TBD" },
    { "dimension": "Valuation Logic", "phase1": "PS 20–40x", "phase2": "PS 8–15x", "phase3": "AI premium recovery" }
  ],
  "sortBy": "dimension",
  "sortDirection": "asc",
  "caption": "SaaS Growth Model Evolution — Synthesized Analysis"
}
```

---

## Quality Checklist

- [ ] **Checked against existingCards — no duplicate analysis cards**
- [ ] Every output has an `action` field (`"create"` or `"enrich"`)
- [ ] Analysis covers at least **3 layers** (surface-only is not acceptable)
- [ ] Includes **concrete data and examples** (pure logical reasoning is not accepted)
- [ ] Causal relationships are **backed by evidence** (intuition alone is insufficient)
- [ ] The **analytical frameworks** used are labeled
- [ ] Conclusions are **non-obvious insights** (widely known common knowledge is not accepted)
- [ ] At least one card contains a **forward-looking trend forecast**
