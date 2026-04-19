# Kind Selection Rules (Shared Reference)

> **All skills producing cards MUST follow the kind selection rules in this file.**
> This file is an independent copy of the "Kind Selection Priority" section from curate/SKILL.md, shared across all skills for consistency.
>
> **📋 Data Structure Standards**: Complete field definitions for each kind are in `packages/types/src/card.ts`. Quick reference in `SCHEMA-GUIDE.md`.

---

## Kind Selection Priority

When encountering data, select the kind using the following priority (choose the **most specific** type):

| Material Content | Recommended kind | Instead of |
|-----------------|-----------------|-----------|
| A set of KPIs/metrics | `data` | ~~writing numbers in `summary`~~ |
| Trend data (multiple time points) | `chart` | ~~describing trends in `data`~~ |
| Row/column comparison table | `table` | ~~writing text tables in `summary`~~ |
| Multi-step process | `process` | ~~listing steps in `keypoint`~~ |
| A vs B comparison | `comparison` | ~~writing comparisons in `argument`~~ |
| Time-ordered events | `timeline` | ~~narrating by time in `summary`~~ |
| Excellent original passage | `quote` | ~~quoting in `summary`~~ |
| Clear opinion + evidence | `argument` | ~~writing opinions in `keypoint`~~ |

---

## Kind Upgrade Hard Rules (Violation = Failure)

When the following quantitative conditions are triggered, you **MUST** use the corresponding higher-order kind. **Downgrading is prohibited**:

| Quantitative Trigger | Must Use | Prohibited Downgrade |
|--------------------|---------|---------------------|
| Data series with ≥3 time points | `chart` | ~~`data` (listing each time point in separate metrics)~~ |
| ≥3 subjects × ≥2 dimensions | `table` | ~~`data` (mixing different subjects' data in metrics)~~ |
| ≥3 ordered steps | `process` | ~~`keypoint` (listing steps in points)~~ |
| Structured comparison of ≥2 subjects | `comparison` | ~~`argument` (text description of comparison)~~ |
| ≥4 time-ordered events | `timeline` | ~~`summary` (narrating by time)~~ |
| Original text has row/column table structure | `table` | ~~`summary` (textual description of table)~~ |

---

## chart Card Quick Reference

```json
{
  "kind": "chart",
  "chartType": "lineChart | barChart | areaChart | pieChart",
  "categories": ["Category1", "Category2", "..."],
  "series": [
    { "name": "SeriesName", "data": [value1, value2, "..."] }
  ],
  "unit": "unit",
  "xAxisLabel": "X-axis label",
  "yAxisLabel": "Y-axis label",
  "dataSource": "Data source",
  "insight": "One-sentence data insight"
}
```

**Constraint**: Every `series[].data` array length MUST equal the `categories` array length.

---

## table Card Quick Reference

```json
{
  "kind": "table",
  "columns": [
    { "key": "col_key", "label": "Column Name", "type": "text | number | percent | currency | date", "unit": "optional unit" }
  ],
  "rows": [
    { "col_key": "value", "...": "..." }
  ],
  "sortBy": "default sort column key",
  "sortDirection": "asc | desc",
  "highlightRow": 0,
  "caption": "Table title"
}
```

**Constraint**: The key names in each `rows` entry MUST correspond exactly to `columns[].key`.

---

## Fragment Kind Preservation Rules

When upstream material-analysis has already labeled fragments as `chart`/`table`/`code`/`timeline` or other high-order types:

1. **Default to preserving the original kind** — do not downgrade without a compelling reason
2. **Downgrading requires an explicit reason** — must explain in `meta.kindDowngradeReason`
3. **Inherit fragment data field** — structured data pre-extracted in the fragment's `data` field should be directly inherited to the card's top-level fields
4. **No silent downgrades** — silently downgrading `chart` to `data` or `table` to `summary` counts as failure
