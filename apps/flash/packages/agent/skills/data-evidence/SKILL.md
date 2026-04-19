---
name: data-evidence
description: Collect and analyze relevant data, statistics, and metrics to support arguments — the data-evidence angle of the research skill.
version: 2.0.0
metadata:
  openclaw:
    emoji: "📊"
    category: research
---

# Data Evidence Skill

Search and organize data evidence that supports arguments, providing persuasive quantitative backing for presentations.

> **📋 Data Structure Standard**: Output cards must conform to `packages/types/src/card.ts`. Pay special attention to `series[].data.length === categories.length` for charts, and `rows key names === columns[].key` for tables.

## When to Use

Called as a sub-angle of the research skill, or used independently when:
- An argument lacks quantitative support
- Industry benchmark data is needed for comparison
- Trend data is needed to illustrate direction of growth

---

## Data Type Framework

### 1. Statistics & Percentages
- Market size, growth rate, penetration rate
- User count, conversion rate, retention rate
- Cost, revenue, profit margin

### 2. Industry Report Data
- Authoritative reports from Gartner, IDC, McKinsey, Forrester, etc.
- Annual reports from industry associations
- Official data published by government statistical agencies

### 3. Benchmarks
- Industry average vs. target value
- Competitor comparison data
- Year-over-year comparison

### 4. Time-Series Trends
- Annual/quarterly growth trends
- Market share changes
- Technology adoption curves (S-curve)

### 5. Rankings & Ratings
- Industry rankings, market rankings
- Product scores, user satisfaction scores
- ESG ratings, credit ratings

---

## Data Search Strategy

### Keyword Templates

```
[Topic] + [Data Type] + "statistics" / "data" / "report" + [Time Range]
```

**Examples**:
- `global AI market size revenue 2024 2025 forecast`
- `SaaS customer acquisition cost benchmark 2024`
- `e-commerce penetration rate statistics by region 2024`
- `enterprise cloud adoption percentage by industry report`

### Data Source Priority

| Priority | Source | Example |
|----------|--------|---------|
| 🥇 Primary Official | Corporate filings, government statistics | Apple 10-K, World Bank |
| 🥈 Authoritative Research | Analyst firm reports | Gartner, McKinsey, BCG |
| 🥉 Aggregated Secondary | Data aggregation platforms | Statista, World Bank Open Data |
| Reference | Industry media | TechCrunch, Bloomberg |

---

## Data Quality Standards

### Required Conditions

| Standard | Requirement |
|----------|-------------|
| **Source Attribution** | Every data point must cite its source and publication date |
| **Timeliness** | Prefer data published within the last 12 months |
| **Verifiability** | Data sources must be publicly accessible |
| **No Fabrication** | Strictly prohibited to invent or extrapolate data not found in the source |
| **Precision** | Preserve the original data's precision; do not round arbitrarily |

### Data Freshness Labels

| Label | Meaning |
|-------|---------|
| 🟢 Fresh | Published within the past 6 months |
| 🟡 Recent | Published 6–18 months ago |
| 🔴 Dated | Published 18+ months ago; note potential staleness |

---

## Anti-Duplication (Required)

The caller will pass existing card summaries via `<existing-cards>` tags in the prompt. **Before producing any card, compare against each existingCard**:

- An existing data/table/chart card already contains the same data point (e.g., "Global AI market $184B") → **Skip**
- An existing card covers the same topic but lacks a new data dimension found in research → Output `"action": "enrich"` to add metrics/rows
- Entirely new data → Output `"action": "create"` for a new card

**Enrich example**:

```json
{
  "action": "enrich",
  "targetCardId": "card-003",
  "enrichFields": {
    "metrics": [
      { "key": "Enterprise AI Software", "value": 72, "unit": "B USD", "change": "+42%", "changeDirection": "up" }
    ],
    "rows": [
      { "segment": "AI Services", "revenue": 44, "growth": "+28%" }
    ]
  },
  "reason": "card-003 already covers total AI market size; this enrichment adds segment-level breakdown"
}
```

**Every output must include an `action` field.**

---

## Output Specification

Produce **3–6 knowledge cards**, recommended types:

| kind | Purpose |
|------|---------|
| `data` | Core data point (single metric + source) |
| `table` | Comparative data (multi-dimension / multi-period) |
| `chart` | Trend / proportion data (with chart description) |
| `summary` | Synthesized data analysis conclusion |

### Data Card Template

```json
{
  "kind": "data",
  "title": "Global AI Market Reaches $184B",
  "summary": "In 2024, the global AI market reached $184B, up 34.8% YoY. Projected to reach $420B by 2027.",
  "tags": ["AI", "market-size", "IDC", "forecast", "data-evidence"],
  "priority": "high",
  "rating": 5,
  "meta": {
    "researchAngle": "Data Evidence",
    "sources": ["IDC Worldwide AI Spending Guide, Q2 2024"],
    "dataFreshness": "2024-Q2",
    "freshness": "fresh"
  },

  "metrics": [
    { "key": "Global AI Market Size", "value": 184, "unit": "B USD", "change": "+34.8%", "changeDirection": "up" },
    { "key": "Enterprise AI Software", "value": 72, "unit": "B USD", "change": "+42%", "changeDirection": "up" },
    { "key": "AI Infrastructure", "value": 68, "unit": "B USD", "change": "+31%", "changeDirection": "up" },
    { "key": "AI Services", "value": 44, "unit": "B USD", "change": "+28%", "changeDirection": "up" }
  ],
  "period": "2024 Q2",
  "benchmark": "vs. 2023",
  "highlight": "Global AI Market Size",
  "visualHint": "kpi-grid"
}
```

### Comparative Data Card Template

```json
{
  "kind": "table",
  "title": "Cloud Platform Market Share Comparison",
  "summary": "AWS leads at 31%, Azure fastest-growing at 25% (+3pp), GCP steady at 11%",
  "tags": ["cloud", "market-share", "competition", "data-evidence"],
  "priority": "high",
  "rating": 4.5,
  "meta": {
    "researchAngle": "Data Evidence",
    "sources": ["Synergy Research Group Q3 2024"],
    "dataFreshness": "2024-Q3",
    "freshness": "fresh"
  },

  "columns": [
    { "key": "platform", "label": "Platform", "type": "text" },
    { "key": "share", "label": "Market Share", "type": "percent" },
    { "key": "change", "label": "YoY Change", "type": "text" }
  ],
  "rows": [
    { "platform": "AWS", "share": 31, "change": "-1pp" },
    { "platform": "Azure", "share": 25, "change": "+3pp" },
    { "platform": "GCP", "share": 11, "change": "+1pp" },
    { "platform": "Alibaba Cloud", "share": 4, "change": "0" },
    { "platform": "Others", "share": 29, "change": "-3pp" }
  ],
  "sortBy": "share",
  "sortDirection": "desc",
  "highlightRow": 0,
  "caption": "Global Cloud Platform Market Share (2024 Q3) — Source: Synergy Research Group"
}
```

### Trend Data Card Template

```json
{
  "kind": "chart",
  "title": "Global AI Market Growth Trend",
  "summary": "Global AI market grew from $58B in 2021 to $184B in 2024, with a CAGR of 47%",
  "tags": ["AI", "market-size", "trend", "forecast", "data-evidence"],
  "priority": "high",
  "rating": 5,
  "meta": {
    "researchAngle": "Data Evidence",
    "sources": ["IDC Worldwide AI Spending Guide, Q2 2024"],
    "dataFreshness": "2024-Q2",
    "freshness": "fresh"
  },

  "chartType": "lineChart",
  "categories": ["2021", "2022", "2023", "2024", "2025E"],
  "series": [
    { "name": "AI Market Size", "data": [58, 86, 136, 184, 250] }
  ],
  "unit": "B USD",
  "xAxisLabel": "Year",
  "yAxisLabel": "Market Size (B USD)",
  "dataSource": "IDC Worldwide AI Spending Guide",
  "insight": "Global AI market has maintained 30%+ growth for 4 consecutive years; projected to exceed $250B in 2025"
}
```

---

## Data Visualization Recommendations

For each data card, include a visualization recommendation in `meta.chartSuggestion`:

| Data Type | Recommended Chart | Chart Component Parameter |
|-----------|------------------|--------------------------|
| Trend over time | Line chart | `chartType: 'lineChart'` |
| Comparative ranking | Bar chart | `chartType: 'barChart'` |
| Proportion / share | Pie chart | `chartType: 'pieChart'` |
| Composition over time | Area chart | `chartType: 'areaChart'` |
| Multi-dimension comparison | Table | Table component |
| Single large number | Highlighted number | Text at large font size |

---

## Quality Checklist

- [ ] **Checked against existingCards — no duplicate data cards**
- [ ] Every output has an `action` field (`"create"` or `"enrich"`)
- [ ] Every data point has a **clear source and date**
- [ ] Priority given to **authoritative primary sources**
- [ ] Data is not fabricated; sources are verifiable
- [ ] **Data freshness** is labeled (fresh / recent / dated)
- [ ] **Visualization method** is recommended
- [ ] Data points are **logically connected** (not randomly assembled)
