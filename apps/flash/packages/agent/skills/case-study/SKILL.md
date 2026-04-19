---
name: case-study
description: Find and analyze relevant real-world cases, extract reusable lessons and insights — the case study angle of the research skill.
version: 2.0.0
metadata:
  openclaw:
    emoji: "📋"
    category: research
---

# Case Study Skill

Find and analyze real-world cases related to the topic, extracting reusable lessons and insights.

> **📋 Data Structure Standard**: All output cards must conform to `packages/types/src/card.ts`. Refer to `SCHEMA-GUIDE.md` for required field reference and self-check checklist.

## When to Use

Called as a sub-angle of the research skill, or used independently when:
- The user needs real-world cases to support an argument
- Industry best practices are needed for reference
- Failed cases are needed to illustrate risk warnings

---

## Case Analysis Framework (SARL)

Every case must cover 4 elements:

### S — Situation
- The **time, location, and industry** of the case
- The **scale and background** of the company or organization
- The **specific problem or opportunity** they faced

### A — Action
- The **specific measures** taken
- The **logic and rationale** behind the decisions
- The **timeline and key milestones** of implementation

### R — Result
- **Quantified outcomes or impact** (specific numbers are required)
- **Deviation from targets**
- **Unexpected gains or side effects**

### L — Lesson
- **Reusable takeaways** (1–3 points)
- **Applicable scenarios and boundary conditions**
- **Special factors that cannot be replicated**

---

## Case Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Success Case** | Validates feasibility of an approach | Arguing "this approach works" |
| **Failure Case** | Reveals risks and pitfalls | Arguing "what to avoid" |
| **Comparative Case** | Contrasts outcomes of different strategies | Arguing "A is better than B" |
| **Transformation Case** | A journey from struggle to success | Arguing "the need for change" |

---

## Search Strategy

### Keyword Template

```
[company/industry] + [action type] + "case study" + [time range]
```

**Examples**:
- `Netflix streaming migration case study 2024`
- `Tesla manufacturing automation results`
- `Shopify merchant platform growth strategy case`
- `digital transformation failure lessons enterprise`

### Source Priority

1. Harvard Business Review (HBR), McKinsey Insights
2. Official company financial reports / annual reports
3. TechCrunch, Wired, Forbes in-depth coverage
4. Industry white papers and research reports

---

## Anti-Duplication (Required)

The caller will pass existing card summaries via `<existing-cards>` tags in the prompt. **Before producing any cards, compare each one against existingCards**:

- An existing `example` card already covers the same company / same case → **skip**
- An existing card covers the same case but lacks specific data/results → output `"action": "enrich"` to supplement `results`
- Entirely new case → output `"action": "create"` for a new card

**enrich example**:

```json
{
  "action": "enrich",
  "targetCardId": "card-007",
  "enrichFields": {
    "results": [
      { "metric": "Cost reduction after deployment", "value": "42%", "period": "Within 12 months" }
    ],
    "tags": ["cost-reduction", "ROI"]
  },
  "reason": "card-007 already has an overview of this company's case; this update adds specific quantified results"
}
```

**Every output card must include an `action` field.**

---

## Output Specification

Produce **3–6 knowledge cards**, recommended types:

| kind | Purpose |
|------|---------|
| `example` | Full case card (with all 4 SARL elements) |
| `summary` | Consolidated case lessons |
| `data` | Key data point from the case (single metric) |
| `quote` | Notable quote or viewpoint from a case subject |
| `table` | Multi-case comparison (≥3 cases × ≥2 dimensions) |
| `chart` | Case outcome trend (≥3 time points with metric changes) |
| `comparison` | Head-to-head comparison of two cases |
| `timeline` | Key milestones of a case |

### Kind Upgrade Rules (Mandatory)

The following scenarios **must** use the advanced card type — **downgrading is prohibited**:

| Data Characteristic | Required kind | Downgrade Forbidden |
|---------------------|--------------|---------------------|
| ≥3 cases in side-by-side comparison | `table` | ~~`summary` (text-based comparison)~~ |
| ≥3 time-point metric changes within a case | `chart` | ~~`data` (listing each time point in metrics)~~ |
| Case A vs Case B success/failure contrast | `comparison` | ~~`example` (cramming two cases into one card)~~ |
| Case development with ≥4 key milestones | `timeline` | ~~`summary` (narrative by time)~~ |

### Case Card Template

```json
{
  "kind": "example",
  "title": "Netflix Streaming Transformation",
  "summary": "Netflix transitioned from DVD rentals to streaming, reaching 260M subscribers and 28x revenue growth",
  "tags": ["digital-transformation", "streaming", "netflix", "case-study"],
  "priority": "high",
  "rating": 5,
  "meta": {
    "researchAngle": "Case Study",
    "caseType": "Transformation Case",
    "company": "Netflix",
    "industry": "Entertainment",
    "timeRange": "2007-2023"
  },

  "subject": "Netflix",
  "scenario": "Transitioning from DVD-by-mail rentals to a streaming platform",
  "challenge": "In 2007, faced with the rise of internet video, Netflix's DVD rental business with $1.2B annual revenue faced disruption",
  "approach": "Invested $40M to develop a streaming platform; split DVD and streaming into separate business lines; in 2013 invested $100M to launch first original content 'House of Cards'",
  "results": [
    { "metric": "Subscribers", "value": "260M+", "context": "As of 2023" },
    { "metric": "Annual Revenue", "value": "$33.7B", "context": "28x growth" },
    { "metric": "Original Content", "value": "100+", "context": "Emmy nominations" }
  ],
  "takeaway": "Self-disruption beats being disrupted; content moats are long-term competitive advantages; transformation requires CEO conviction and sustained commitment",
  "industry": "Entertainment"
}
```

### Case Outcome Trend Card Template (chart)

```json
{
  "kind": "chart",
  "title": "Netflix Subscriber Growth Trajectory",
  "summary": "Netflix grew from 7.4M subscribers at pivot in 2007 to 260M+ by 2023, a 23% CAGR",
  "tags": ["Netflix", "growth", "subscribers", "case-study"],
  "priority": "high",
  "rating": 4.5,
  "meta": {
    "researchAngle": "Case Study",
    "caseType": "Transformation Case",
    "company": "Netflix",
    "sources": ["Netflix Annual Reports 2007-2023"]
  },

  "chartType": "lineChart",
  "categories": ["2007", "2010", "2013", "2016", "2019", "2023"],
  "series": [
    { "name": "Subscribers", "data": [740, 2000, 4400, 9400, 16700, 26000] }
  ],
  "unit": "10K",
  "xAxisLabel": "Year",
  "yAxisLabel": "Subscribers (10K)",
  "dataSource": "Netflix Annual Reports",
  "insight": "Exponential growth began after the original content strategy launched in 2013"
}
```

### Multi-Case Comparison Card Template (table)

```json
{
  "kind": "table",
  "title": "Streaming Transformation Case Comparison",
  "summary": "Netflix led the most successful self-disruption; Disney+ achieved fastest catch-up; traditional media broadly lagged",
  "tags": ["streaming", "digital-transformation", "comparison", "case-study"],
  "priority": "high",
  "rating": 4,
  "meta": {
    "researchAngle": "Case Study",
    "caseType": "Comparative Case",
    "sources": ["Company Annual Reports 2023"]
  },

  "columns": [
    { "key": "company", "label": "Company", "type": "text" },
    { "key": "launchYear", "label": "Pivot Year", "type": "text" },
    { "key": "subscribers", "label": "Subscribers", "type": "text" },
    { "key": "profitable", "label": "Profitable", "type": "text" },
    { "key": "lesson", "label": "Key Lesson", "type": "text" }
  ],
  "rows": [
    { "company": "Netflix", "launchYear": "2007", "subscribers": "260M+", "profitable": "✅", "lesson": "First-mover advantage + original content moat" },
    { "company": "Disney+", "launchYear": "2019", "subscribers": "150M+", "profitable": "⚠️ Near break-even", "lesson": "IP library is the biggest accelerator" },
    { "company": "Peacock (NBC)", "launchYear": "2020", "subscribers": "34M", "profitable": "❌", "lesson": "Late entry without differentiation leaves no path to win" }
  ],
  "sortBy": "subscribers",
  "sortDirection": "desc",
  "highlightRow": 0,
  "caption": "Streaming Transformation Case Comparison — As of end of 2023"
}
```

---

## Quality Checklist

- [ ] **Checked against existingCards — no duplicate case cards**
- [ ] Every output card includes an `action` field (`"create"` or `"enrich"`)
- [ ] Every case has **specific numbers and dates**
- [ ] Results section is **quantified** (vague phrases like "achieved good results" are not acceptable)
- [ ] Lessons are **actionable** (platitudes like "be innovative" are not acceptable)
- [ ] Case sources are **verifiable** (`meta.sources` must be filled in)
- [ ] Cases have **variety** (do not produce 3 pure success cases)
