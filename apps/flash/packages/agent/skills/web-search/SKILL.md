---
name: web-search
description: Search the internet for the latest information, data, and articles to enrich content — online data collection capability.
version: 2.0.0
metadata:
  openclaw:
    emoji: "🌐"
    category: data
---

# Web Search Skill

Use search tools to find the latest information online, providing authoritative and timely data and viewpoints to support content.

> **📋 Data Structure Standard**: Output cards must conform to the TypeScript types in `packages/types/src/card.ts`. Pay special attention to chart/table data consistency constraints — consult `SCHEMA-GUIDE.md`.

## When to Use

The caller activates this skill when:
- The latest industry data and reports are needed
- Relevant news and developments need to be found
- Terminology definitions and authoritative explanations need to be looked up
- Competitive information and market data need to be collected
- The research skill internally calls for online search

---

## Search Strategy Framework

### Keyword Construction Rules

```
[core topic] + [constraint] + [data type] + [time constraint]
```

**Examples**:

| Need | Search keywords |
|------|----------------|
| Market size | `global AI market size revenue 2024` |
| Industry trends | `SaaS trends predictions 2025` |
| Competitive analysis | `Notion vs Obsidian comparison features 2024` |
| Expert opinion | `Sam Altman AI safety interview 2024` |
| Technical details | `transformer architecture improvements 2024 paper` |

### Search Iteration Strategy

1. **Round 1: Broad search** — use general keywords to understand the full picture
2. **Round 2: Narrow search** — focus on specific data points based on round 1 results
3. **Round 3: Validation search** — cross-validate key data (different keywords or sources)

### Language Strategy

| Search Purpose | Recommended Language |
|---------------|---------------------|
| Global data, technology trends | English |
| Regional market data | Local language |
| Academic papers | English |
| Policy and regulation | Target country's language |

---

## Source Credibility Grading

| Grade | Source Type | Examples | Confidence |
|-------|------------|---------|-----------|
| 🥇 S | Official primary data | Company reports, government stats, central bank data | 0.95+ |
| 🥈 A | Authoritative research institutions | Gartner, McKinsey, IDC, World Bank | 0.85–0.95 |
| �� B | Major media in-depth reporting | Reuters, Bloomberg, MIT Tech Review | 0.75–0.85 |
| C | Industry blogs/analysts | Stratechery, a16z, notable personal blogs | 0.60–0.75 |
| D | Social/forums | Reddit, Twitter/X | 0.40–0.60 |

**Rule**: Key data must come from grade B or above; grade D sources can only serve as leads, not final data citations.

---

## Processing Search Results

### Extraction Priority

| Priority Extract | Secondary Extract | Ignore |
|----------------|------------------|--------|
| Specific numbers and percentages | Expert opinions and analysis | Ads and promotional content |
| Time-stamped data | Trend descriptions | Repeated information |
| Authoritative citations | Brief case summaries | Unsourced assertions |
| Ranking and comparison data | Background information | Outdated data |

### Data Recording Format

For each valuable search result, record:
- **Content**: Specific information
- **Source**: Name of the source
- **Date**: Publication/update date
- **Credibility**: Source grade

---

## Anti-Duplication (Required)

The caller will pass a concise summary of existing cards via `<existing-cards>` tags. **Before organizing search results into cards, compare each one against existingCards**:

- An existing card already covers that data point → **skip**
- An existing card partially covers the topic, new data from search can supplement → output `"action": "enrich"` instruction
- New information → output `"action": "create"` new card

**Enrich example**:

```json
{
  "action": "enrich",
  "targetCardId": "card-012",
  "enrichFields": {
    "metrics": [
      { "key": "Q4 2024 Revenue", "value": 58, "unit": "B USD", "change": "+22%", "changeDirection": "up" }
    ],
    "meta": {
      "sources": ["Bloomberg, 2024-12-15"]
    }
  },
  "reason": "card-012 already has annual total data; supplementing latest quarterly breakdown from search"
}
```

**Every output must include an `action` field.**

---

## Output Specification

Organize search results into knowledge cards. Recommended types:

| kind | Purpose |
|------|---------|
| `data` | Key data points found (single metric) |
| `reference` | Important sources/reference links |
| `summary` | Consolidated summary of search results |
| `quote` | Verbatim quotes from experts/authorities |
| `table` | Multi-dimensional comparison data (≥3 subjects × ≥2 dimensions) |
| `chart` | Trend data (≥3 time points) |
| `comparison` | A vs B comparisons found |

### Kind Upgrade Rules (Hard)

The following scenarios **must** use the higher-order card type — **downgrading is prohibited**:

| Data characteristic | Must use kind | Prohibited downgrade |
|--------------------|--------------|---------------------|
| Found ≥3 time-point data | `chart` | ~~`data` (listing each time point in metrics)~~ |
| Found ≥3 subject comparison data | `table` | ~~`data` (mixing different subjects' data)~~ |
| Found A vs B evaluation comparison | `comparison` | ~~`summary` (text description of comparison)~~ |

### Search Result Data Card Template

```json
{
  "action": "create",
  "id": "card-020",
  "kind": "data",
  "title": "AI Infrastructure Investment $200B",
  "summary": "Global tech giants' AI infrastructure capex reached $200B in 2024, up 60% YoY",
  "sourceId": null,
  "linkedCardIds": [],
  "tags": ["AI", "infrastructure", "investment", "capex"],
  "priority": "high",
  "autoGenerated": true,
  "rating": 4.5,
  "meta": {
    "sources": ["Goldman Sachs AI Investment Report, June 2024"],
    "sourceGrade": "A",
    "dataFreshness": "2024-06",
    "freshness": "fresh",
    "searchQuery": "AI infrastructure investment capex 2024 tech giants"
  },
  "metrics": [
    { "key": "Total AI Infrastructure Investment", "value": 200, "unit": "B USD", "change": "+60%", "changeDirection": "up" },
    { "key": "Microsoft", "value": 50, "unit": "B USD" },
    { "key": "Google", "value": 48, "unit": "B USD" },
    { "key": "Meta", "value": 37, "unit": "B USD" },
    { "key": "Amazon", "value": 35, "unit": "B USD" }
  ],
  "period": "2024",
  "highlight": "Total AI Infrastructure Investment",
  "visualHint": "kpi-grid"
}
```

---

## Search Anti-Patterns (Avoid)

| ❌ Anti-pattern | ✅ Correct approach |
|----------------|-------------------|
| Draw conclusions from a single search | Search at least 2–3 times; cross-validate |
| Use vague search terms | Use precise keywords with constraints |
| Only look at the first result | Aggregate and compare multiple results |
| Copy search results directly | Extract core information; annotate source |
| Ignore data recency | Note publication date and freshness |
| Fabricate data not found in searches | Honestly note "no relevant data found" |

---

## Quality Standards

- [ ] **Compared against existingCards — no duplicate cards**
- [ ] Every output includes `action` field (`"create"` or `"enrich"`)
- [ ] Every data point has **source and date** annotated
- [ ] Key data **cross-validated** (≥2 sources)
- [ ] Source credibility **grade B or above**
- [ ] Search covers **multiple angles**
- [ ] **Unfindable information** is honestly noted
- [ ] Data freshness **within 18 months**
