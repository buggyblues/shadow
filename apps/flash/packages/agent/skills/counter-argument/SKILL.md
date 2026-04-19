---
name: counter-argument
description: Examine viewpoints from the opposing side, surface potential risks and rebuttal evidence — the counter-argument angle of the research skill.
version: 2.0.0
metadata:
  openclaw:
    emoji: "⚖️"
    category: research
---

# Counter-Argument Skill

Examine the topic and arguments from the opposing side, identifying logical gaps and potential risks. This is a critical capability for strengthening the rigor of any argument.

> **📋 Data Structure Standard**: All output cards must conform to `packages/types/src/card.ts`. Refer to `SCHEMA-GUIDE.md` for required field reference and self-check checklist.

## When to Use

Called as a sub-angle of the research skill, or used independently when:
- Anticipating objections from the audience
- Strengthening the comprehensiveness and credibility of an argument
- Identifying risks and limitations in a proposed approach

---

## Analysis Framework (LARBT)

Conduct counter-analysis across 5 dimensions:

### L — Logic Gaps
- **Weak links** in the chain of reasoning
- Does the cause-and-effect relationship hold? Is there any conflation of correlation and causation?
- Is there **overgeneralization** or **sampling bias**?
- Are there **logical leaps** in the inference?

### A — Adverse Evidence
- **Data or cases** that contradict the main argument
- Do **counterexamples** exist?
- **Success data** from competing approaches
- **Alternative interpretations** of the same data

### R — Rival Explanations
- **Different causal interpretations** of the same phenomenon
- Is the relationship **correlational** rather than causal?
- Is there a **simpler explanation**? (Occam's Razor)
- Are **external factors** being ignored?

### B — Boundary Conditions
- **Scenarios where the argument does not apply**
- Scale limits (effective for small teams vs. fails in large organizations)
- Industry limits (applicable in tech vs. inapplicable in traditional sectors)
- Time limits (effective short-term vs. risky long-term)

### T — Threats
- Possible **negative consequences**
- **Second-order effects** (solving problem A while causing problem B)
- **Opportunity costs**
- **Irreversibility** — if this is wrong, how large is the cost?

---

## Counter-Argument Severity Levels

| Level | Criteria | Recommended Response |
|-------|----------|---------------------|
| 🔴 Fatal | Can directly refute the core argument | Must respond head-on; revise the original argument |
| 🟡 Significant | Weakens the credibility of the argument | Proactively acknowledge and provide a mitigation in the presentation |
| 🟢 Minor | Peripheral objection; does not affect the core | Prepare a response for Q&A |

---

## Anti-Duplication (Required)

The caller will pass existing card summaries via `<existing-cards>` tags in the prompt. **Before producing any cards, compare each one against existingCards**:

- An existing `argument` card already contains the same counter-argument → **skip**
- An existing card covers the same counter-argument but lacks new adverse evidence → output `"action": "enrich"` to supplement evidence
- Entirely new counter-argument → output `"action": "create"` for a new card

**enrich example**:

```json
{
  "action": "enrich",
  "targetCardId": "card-020",
  "enrichFields": {
    "evidence": [
      "Gartner 2024: 30% of generative AI projects will be abandoned after proof of concept",
      "Actual deployment costs run 2–5x higher than expected (Andreessen Horowitz survey)"
    ],
    "tags": ["implementation-risk"]
  },
  "reason": "card-020 already has the 'AI is hard to deploy' counter-argument; this update adds authoritative adverse evidence"
}
```

**Every output card must include an `action` field.**

---

## Output Specification

Produce **3–6 knowledge cards**, recommended types:

| kind | Purpose |
|------|---------|
| `argument` | Counter-argument card (with supporting evidence) |
| `keypoint` | Key risk point |
| `data` | Adverse data / counterexample (single metric) |
| `summary` | Comprehensive risk assessment |
| `table` | Multi-dimensional risk comparison (≥3 risks × ≥2 dimensions) |
| `chart` | Adverse trend data (≥3 time points, e.g. failure rate trend) |
| `comparison` | Pro-argument vs. counter-argument side-by-side |

### Kind Upgrade Rules (Mandatory)

The following scenarios **must** use the advanced card type — **downgrading is prohibited**:

| Data Characteristic | Required kind | Downgrade Forbidden |
|---------------------|--------------|---------------------|
| ≥3 time-point adverse trend | `chart` | ~~`data` (listing each time point in metrics)~~ |
| ≥3 risks × ≥2 dimensions (probability/impact/urgency) | `table` | ~~`keypoint` (text list of risks)~~ |
| Pro-argument vs. counter-argument side-by-side | `comparison` | ~~`argument` (text description of contrast)~~ |

### Counter-Argument Card Template

```json
{
  "kind": "argument",
  "title": "AI Amplifies Job Polarization",
  "summary": "The gains from AI automation are unevenly distributed, with low-skill workers facing a disproportionate impact",
  "tags": ["AI", "employment", "inequality", "counter-argument"],
  "priority": "high",
  "rating": 4,
  "meta": {
    "researchAngle": "Counter-Argument",
    "dimension": "Adverse Evidence",
    "severity": "significant",
    "suggestedResponse": "Add a fair transition section to the narrative"
  },

  "claim": "The gains from AI automation are extremely unevenly distributed and may exacerbate job polarization rather than benefit all workers",
  "evidence": [
    { "type": "statistic", "text": "Between 2000–2020, automation eliminated approximately 2.6 million U.S. manufacturing jobs, while new jobs created were concentrated in high-skill sectors", "source": "MIT, Daron Acemoglu" },
    { "type": "statistic", "text": "62% of workers without a college degree believe AI will reduce their job opportunities", "source": "Pew Research 2023" },
    { "type": "expert", "text": "60% of jobs in developing countries face automation risk", "source": "World Bank" }
  ],
  "counterpoint": null,
  "strength": "moderate",
  "logicType": "inductive"
}
```

### Adverse Trend Card Template (chart)

```json
{
  "kind": "chart",
  "title": "AI Project Failure Rates Rising Year Over Year",
  "summary": "Enterprise AI project failure rates rose from 65% in 2020 to 76% in 2024, forming a scissors gap with investment growth",
  "tags": ["AI", "failure-rate", "risk", "counter-argument"],
  "priority": "high",
  "rating": 5,
  "meta": {
    "researchAngle": "Counter-Argument",
    "sources": ["Gartner AI Project Survey 2024", "RAND Corporation 2024"]
  },

  "chartType": "lineChart",
  "categories": ["2020", "2021", "2022", "2023", "2024"],
  "series": [
    { "name": "AI Project Failure Rate", "data": [65, 68, 70, 73, 76] },
    { "name": "AI Investment Growth (normalized)", "data": [100, 145, 195, 260, 350] }
  ],
  "unit": "%",
  "xAxisLabel": "Year",
  "yAxisLabel": "Failure Rate (%) / Investment Index",
  "dataSource": "Gartner AI Project Survey 2024",
  "insight": "AI investment grew 3.5x while failure rate increased 11pp, indicating deteriorating return on investment efficiency"
}
```

### Risk Comparison Card Template (table)

```json
{
  "kind": "table",
  "title": "Three Key Risk Dimensions of AI Deployment",
  "summary": "Data quality risk has the highest impact; organizational resistance is the hardest to resolve; compliance risk is the most urgent",
  "tags": ["AI", "risk-assessment", "counter-argument"],
  "priority": "high",
  "rating": 4.5,
  "meta": {
    "researchAngle": "Counter-Argument",
    "sources": ["McKinsey AI Survey 2024", "Gartner 2024"]
  },

  "columns": [
    { "key": "risk", "label": "Risk Type", "type": "text" },
    { "key": "probability", "label": "Probability", "type": "percent" },
    { "key": "impact", "label": "Impact Level", "type": "text" },
    { "key": "urgency", "label": "Urgency", "type": "text" }
  ],
  "rows": [
    { "risk": "Insufficient data quality", "probability": 65, "impact": "Fatal", "urgency": "High" },
    { "risk": "Organizational resistance / talent shortage", "probability": 58, "impact": "Significant", "urgency": "Medium" },
    { "risk": "Compliance and ethics risk", "probability": 47, "impact": "Significant", "urgency": "Urgent" }
  ],
  "sortBy": "probability",
  "sortDirection": "desc",
  "highlightRow": 0,
  "caption": "Core AI Deployment Risk Assessment — McKinsey/Gartner 2024"
}
```

---

## Usage Recommendations

### How to Present Counter-Arguments in a Presentation

1. **Pre-emptive response** — Proactively raise "you might be wondering..." within the argument itself
2. **Data offset** — Lead with the adverse data, then refute it with stronger supporting data
3. **Scope qualification** — Acknowledge boundary conditions to increase credibility
4. **Risk matrix** — Use a Table component to show risk assessment (probability × impact)

---

## Quality Checklist

- [ ] **Checked against existingCards — no duplicate counter-argument cards**
- [ ] Every output card includes an `action` field (`"create"` or `"enrich"`)
- [ ] Every counter-argument is backed by **specific data or cases**
- [ ] **Severity level is labeled** (Fatal / Significant / Minor)
- [ ] **Suggested response strategy** is provided
- [ ] Analysis dimensions are **varied** (do not only cover logic gaps)
- [ ] Tone is **objective and neutral** — do not favor either side
