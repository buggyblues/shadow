---
name: curate
description: Extract, classify, and link knowledge cards from uploaded raw materials — core material organization capability.
version: 4.0.0
metadata:
  openclaw:
    emoji: "📋"
---

# Curate Skill — Materials → Structured Knowledge Cards

You are a material organization assistant. Carefully analyze the given materials and extract **structured** knowledge cards from them.

**Core philosophy: Each card kind is an independent data type. Data lives directly at the top-level fields — no secondary wrapper.**

> **📋 Data Structure Standard**: All output cards must conform to the TypeScript types in `packages/types/src/card.ts`.
> Consult `SCHEMA-GUIDE.md`'s "Required Specialized Fields Per Kind" and "Pre-Output Checklist" before producing output.

## When to Use

The caller activates this skill when:
- The user uploads one or more materials and needs to extract structured knowledge
- The user asks to "analyze materials", "extract key points", or "organize content"
- Pre-processing stage before generation

---

## Card Kind Overview

| kind | Name | Description | Typical priority |
|------|------|-------------|-----------------|
| `quote` | Quote | Memorable original text, famous sayings | high |
| `summary` | Summary | Core overview of a section | medium |
| `argument` | Argument | Main viewpoint + supporting evidence | high |
| `data` | Data | Statistics, percentages, KPIs | high |
| `table` | Table | Structured tabular data | medium |
| `image` | Image | Image content description | medium |
| `code` | Code | Code snippet + language annotation | medium |
| `chart` | Chart | Visualizable chart data | medium |
| `idea` | Idea | Creative concept, inspiration | medium |
| `keypoint` | Keypoint | Key takeaways, core information | high |
| `definition` | Definition | Concept definitions, terminology | low |
| `example` | Example | Concrete cases, practical applications | medium |
| `reference` | Reference | Source attribution, citation info | low |
| `timeline` | Timeline | Time-ordered events | medium |
| `comparison` | Comparison | Comparison of two or more things | medium |
| `process` | Process | Step-by-step flow description | medium |
| `inspiration` | Inspiration | Next-step action suggestion (from inspire skill) | medium |

---

## ⚠️ Fidelity Hard Constraints (violating any = failure)

1. **Faithful to source**: Card content must faithfully represent the original material. Do not alter, embellish, exaggerate, or minimize.
2. **Exact quotations**: The `text` field of `quote` cards must be **word-for-word identical** to the original text — do not paraphrase.
3. **No fabricated data**: The `metrics` in `data` cards must come directly from the source material — **never fabricate, extrapolate, or round arbitrarily**.
4. **No cross-material mixing**: Each card's `sourceId` must be accurate. **Never blend content from different materials into the same card.**
5. **No opinion polishing**: Faithfully convey the stance and viewpoint of the source, preserving the author's tone and attitude.
6. **Summary fidelity**: `summary` and `keypoint` abstractions must have basis in the original text — do not add judgments not present in the source.
7. **Traceable**: Every card must have a clearly identifiable information source in its corresponding `sourceId` material.

---

## ⚠️ Anti-Duplication — Required (violating = failure)

The caller will pass a concise summary of **already-existing cards** in the project via `<existing-cards>` tags. You **must scan these existing cards before extracting any card**.

### Deduplication Decision Flow

For **each candidate piece of information** found in the materials, execute the following:

1. **Scan existingCards** — compare by `title` + `summary` + `kind` + `tags`
2. **Assess similarity**:
   - Same fact/data/viewpoint/quote → **already covered**
   - Same topic but new information is more detailed or has additional dimensions → **can enrich**
   - Completely new information → **can create**
3. **Execute action**:

| Decision | Action | Output |
|---------|--------|--------|
| Covered, no new info | **Skip** | Not output |
| Partially covered, new data/dimensions | **Enrich** | Output `"action": "enrich"` instruction |
| New information | **Create** | Output complete card with `"action": "create"` |

### Output Format

Every output card (or enrich instruction) **must** include an `action` field:

**Create**:
```json
{
  "action": "create",
  "id": "card-005",
  "kind": "data",
  "title": "...",
  ...all fields
}
```

**Enrich existing card**:
```json
{
  "action": "enrich",
  "targetCardId": "card-001",
  "enrichFields": {
    "metrics": [
      { "key": "Overseas Revenue", "value": 28, "unit": "B CNY", "change": "+45%", "changeDirection": "up" }
    ],
    "tags": ["overseas"]
  },
  "reason": "card-001 already has total revenue data; supplementing with overseas revenue breakdown"
}
```

### Deduplication Boundaries

- **Same data point** (e.g., "2024 revenue 10.3B") → covered, skip
- **Same metric's different breakdown** (e.g., "overseas 2.8B" is a sub-breakdown of total revenue) → enrich the existing data card
- **Same topic, different angle** (e.g., "reasons for revenue growth" vs "10.3B revenue fact") → create new, these are different information
- **Identical verbatim quote** → covered, skip
- **Completely different topic** → create new

### If No Existing Cards

If the caller passes an empty `<existing-cards>` array `[]`, the project has no cards yet. Mark all cards `"action": "create"`.

---

## Output Method

The caller will specify the card file path in the prompt. Path format follows the v8 file structure spec:

```
/data/projects/<projectId>/ai-output/curate-<timestamp>.json
```

**You must use the `write` tool to write the complete card JSON array to that file.** This is the only output method.

### Output Rules

- **Do not** output JSON code blocks in the conversation
- **Do not** output cards one by one
- Write the complete JSON array to the specified path in one operation
- The server uses `file-watcher` to monitor the `ai-output/` directory and will read and push immediately after you write

**Format requirement**: File content must be a valid JSON array, e.g. `[{...}, {...}, ...]`.

---

## Card Base Fields (shared by all kinds)

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier, format `card-<number>` (starting from 001) |
| `kind` | ✅ | One of the card kinds listed above |
| `title` | ✅ | Short title (≤30 chars, accurately captures card core) |
| `summary` | ✅ | One-sentence abstract (≤150 chars, for quick browsing only) |
| `sourceId` | ✅ | Source material ID (must be a given material ID) |
| `linkedCardIds` | ✅ | Related card ID array (bidirectional references) |
| `tags` | ✅ | Tag array (1–5 items) |
| `priority` | ✅ | `high` / `medium` / `low` |
| `autoGenerated` | ✅ | Fixed `true` |
| `rating` | ✅ | 1–5 (0.5 increments), rate by content value |
| `deckIds` | — | Fill if corresponding Deck exists |
| `meta` | — | Extended fields (source location, confidence, etc.) |

**In addition to the shared fields above, each kind has its own specialized fields, placed directly at the card top level.** There is no `content` field and no `structured` wrapper.

---

## Kind-Specific Schemas

### `data` — Data Card

Stores statistics, KPIs, percentages. **Core: `metrics` array (Key/Value/Unit).**

```json
{
  "action": "create",
  "id": "card-001",
  "kind": "data",
  "title": "2024 Revenue Record High",
  "summary": "Full-year revenue 10.3B CNY, up 23% YoY, all three business lines profitable",
  "sourceId": "mat-001",
  "linkedCardIds": ["card-002"],
  "tags": ["revenue", "growth", "must-use"],
  "priority": "high",
  "autoGenerated": true,
  "rating": 5,
  "meta": { "source": "page 3, paragraph 2", "confidence": 0.98 },

  "metrics": [
    { "key": "Full-Year Revenue", "value": 103, "unit": "B CNY", "change": "+23%", "changeDirection": "up" },
    { "key": "Net Profit", "value": 15.2, "unit": "B CNY", "change": "+31%", "changeDirection": "up" },
    { "key": "Profit Margin", "value": 14.8, "unit": "%", "change": "+2.1pp", "changeDirection": "up" },
    { "key": "Profitable Business Lines", "value": 3, "unit": "" }
  ],
  "period": "FY2024",
  "benchmark": "YoY vs 2023",
  "highlight": "Full-Year Revenue",
  "visualHint": "kpi-grid"
}
```

**`metrics[]` fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `key` | ✅ | Metric name |
| `value` | ✅ | Metric value (number or string) |
| `unit` | ✅ | Unit (e.g. `"B CNY"`, `"%"`, `"K users"`) |
| `change` | — | Change magnitude (e.g. `"+23%"`, `"-5pp"`) |
| `changeDirection` | — | `"up"` / `"down"` / `"neutral"` |

**data specialized fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `metrics` | ✅ | Metrics array |
| `period` | — | Time period for the data |
| `benchmark` | — | Comparison baseline |
| `highlight` | — | Metric key to highlight |
| `visualHint` | — | `"big-number"` / `"kpi-grid"` / `"comparison"` / `"trend"` |

---

### `chart` — Chart Card

Stores data series renderable as a chart. **Core: `series` + `categories`, can be fed directly to Chart component.**

```json
{
  "action": "create",
  "id": "card-002",
  "kind": "chart",
  "title": "Quarterly Revenue Growth Trend",
  "summary": "2024 quarterly revenue grew consistently; Product B hit 100% growth becoming the new growth engine",
  "sourceId": "mat-001",
  "linkedCardIds": ["card-001"],
  "tags": ["revenue", "trend", "evidence"],
  "priority": "medium",
  "autoGenerated": true,
  "rating": 4,

  "chartType": "lineChart",
  "categories": ["Q1", "Q2", "Q3", "Q4"],
  "series": [
    { "name": "Product A", "data": [14, 15, 17, 19] },
    { "name": "Product B", "data": [5, 7, 8, 10] },
    { "name": "Product C", "data": [2, 2, 2, 2] }
  ],
  "unit": "B CNY",
  "xAxisLabel": "Quarter",
  "yAxisLabel": "Revenue (B CNY)",
  "dataSource": "2024 Annual Report",
  "insight": "Product B grew 100%, becoming the new growth engine"
}
```

**chart specialized fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `chartType` | ✅ | `"barChart"` / `"lineChart"` / `"areaChart"` / `"pieChart"` |
| `categories` | ✅ | X-axis categories (string array) |
| `series` | ✅ | Data series array, each with `name` + `data` (numeric array) |
| `unit` | — | Value unit |
| `xAxisLabel` | — | X-axis label |
| `yAxisLabel` | — | Y-axis label |
| `dataSource` | — | Data source description |
| `insight` | — | Data insight (one-sentence trend/pattern summary) |

**⚠️ Constraint**: Every `series[].data` length **must equal** `categories` length.

---

### `table` — Table Card

Stores row-column structured data. **Preserves original table structure, directly renderable.**

```json
{
  "action": "create",
  "id": "card-003",
  "kind": "table",
  "title": "Three Product Lines Comparison",
  "summary": "Product A leads in revenue but growth is slowing; Product B grew 42% with the strongest momentum",
  "sourceId": "mat-001",
  "linkedCardIds": ["card-001", "card-002"],
  "tags": ["product", "comparison"],
  "priority": "medium",
  "autoGenerated": true,
  "rating": 4,

  "columns": [
    { "key": "product", "label": "Product Line", "type": "text" },
    { "key": "revenue", "label": "Revenue (B CNY)", "type": "number" },
    { "key": "growth", "label": "YoY Growth", "type": "percent" },
    { "key": "margin", "label": "Gross Margin", "type": "percent" }
  ],
  "rows": [
    { "product": "Product A", "revenue": 58, "growth": 12, "margin": 45 },
    { "product": "Product B", "revenue": 30, "growth": 42, "margin": 38 },
    { "product": "Product C", "revenue": 15, "growth": 8, "margin": 62 }
  ],
  "sortBy": "revenue",
  "sortDirection": "desc",
  "caption": "Three product lines performance comparison — FY2024"
}
```

**⚠️ Constraint**: Row key names must exactly match `columns[].key`.

---

### `quote` — Quote Card

Stores memorable original text verbatim.

```json
{
  "kind": "quote",
  "text": "The only way to do great work is to love what you do.",
  "author": "Steve Jobs",
  "role": "Co-founder, Apple",
  "source": "Stanford Commencement Address 2005",
  "language": "en",
  "emphasis": ["love what you do"]
}
```

---

### `argument` — Argument Card

Stores a main claim with supporting evidence.

```json
{
  "kind": "argument",
  "claim": "AI adoption in enterprise will reach 80% by 2026",
  "evidence": [
    { "type": "statistic", "text": "Current adoption at 54%, growing 18pp/year since 2022", "source": "McKinsey 2024" },
    { "type": "trend", "text": "Hyperscalers investing $200B+ in AI infrastructure in 2024" },
    { "type": "expert", "text": "Gartner predicts 75% of enterprises will pilot GenAI by 2025" }
  ],
  "counterpoint": "Skills gap and regulation may slow adoption",
  "strength": "strong",
  "logicType": "inductive"
}
```

---

### `keypoint` — Keypoint Card

Stores key takeaways as a structured point list.

```json
{
  "kind": "keypoint",
  "points": [
    { "label": "Process Automation", "detail": "RPA + AI improves back-office processing efficiency by 40–60%", "icon": "robot" },
    { "label": "Decision Augmentation", "detail": "AI-assisted decisions improve forecast accuracy by 25%", "icon": "brain" },
    { "label": "Customer Experience", "detail": "AI support resolution rate reaches 85%, response time down 70%", "icon": "headset" }
  ],
  "context": "Three paths differ in maturity; process automation is most mature, customer experience is hottest",
  "layout": "vertical"
}
```

---

### `definition` — Definition Card

Stores concept definitions and terminology.

```json
{
  "kind": "definition",
  "term": "RAG",
  "abbreviation": "RAG",
  "fullName": "Retrieval-Augmented Generation",
  "definition": "A technique that enhances LLM responses by retrieving relevant documents from an external knowledge base before generation.",
  "category": "AI/ML",
  "relatedTerms": ["LLM", "vector search", "knowledge base"],
  "example": "A RAG-powered chatbot retrieves company FAQs before answering customer questions"
}
```

---

### `example` — Example Card

Stores concrete case studies.

```json
{
  "kind": "example",
  "subject": "Netflix AI Recommendation System",
  "scenario": "Netflix deployed collaborative filtering + deep learning to personalize content recommendations for 260M+ users",
  "challenge": "How to maintain user engagement at scale with an ever-growing content library",
  "approach": "Trained multi-armed bandit models on viewing history; A/B tested thumbnail variants per user segment",
  "results": [
    { "metric": "User Retention Rate", "value": "93%", "context": "Industry average ~60%" },
    { "metric": "Annual Content Cost Savings", "value": "$1B", "context": "Via targeted commissioning" }
  ],
  "takeaway": "Personalization at scale requires continuous experimentation and real-time feedback loops",
  "industry": "Entertainment / Tech"
}
```

---

### `summary` — Summary Card

```json
{
  "kind": "summary",
  "body": "Enterprise AI adoption has moved from pilot to scale, but 65% of companies still face dual bottlenecks of data quality and talent shortage.\n\n**Key Points:**\n1. **Adoption**: 72% of enterprises have deployed at least one AI application, up 18pp vs 2022\n2. **ROI gap**: Top 20% of enterprises achieve 15–25% AI ROI; bottom 40% have not turned positive\n3. **Barriers**: Data quality (65%), talent shortage (58%), organizational resistance (42%)\n4. **Trend**: GenAI investment share jumped from 8% in 2023 to 28% in 2024"
}
```

---

### `reference` — Reference Card

```json
{
  "kind": "reference",
  "refTitle": "State of AI in the Enterprise 2024",
  "authors": ["McKinsey Global Institute"],
  "publishDate": "2024-06",
  "url": "https://mckinsey.com/ai-report-2024",
  "refType": "report",
  "credibility": "high",
  "citedIn": ["card-001", "card-005"]
}
```

---

### `timeline` — Timeline Card

```json
{
  "kind": "timeline",
  "events": [
    { "date": "2017", "title": "Transformer introduced", "detail": "Vaswani et al. published 'Attention Is All You Need', revolutionizing NLP", "significance": "high" },
    { "date": "2020", "title": "GPT-3 released", "detail": "OpenAI released 175B parameter model, demonstrating few-shot learning", "significance": "high" },
    { "date": "2022-11", "title": "ChatGPT launch", "detail": "ChatGPT reached 1M users in 5 days, sparking mainstream AI adoption", "significance": "high" }
  ],
  "span": "2017–2024",
  "direction": "horizontal"
}
```

---

### `comparison` — Comparison Card

```json
{
  "kind": "comparison",
  "subjects": ["Traditional ML", "Generative AI"],
  "dimensions": [
    { "label": "Training Data Need", "values": ["Labeled (thousands)", "Unlabeled (billions)"], "winner": 1 },
    { "label": "Task Flexibility", "values": ["Single task", "Multi-task"], "winner": 1 },
    { "label": "Interpretability", "values": ["High", "Low"], "winner": 0 }
  ],
  "conclusion": "GenAI excels at flexibility and scale; traditional ML is preferred when interpretability matters",
  "visualHint": "versus"
}
```

---

### `process` — Process Card

```json
{
  "kind": "process",
  "steps": [
    { "order": 1, "label": "Define Problem", "detail": "Identify the business question and success metric", "icon": "target" },
    { "order": 2, "label": "Collect Data", "detail": "Gather labeled training data from internal and external sources" },
    { "order": 3, "label": "Train Model", "detail": "Select algorithm, tune hyperparameters, evaluate on validation set" },
    { "order": 4, "label": "Deploy", "detail": "Containerize and deploy to production with monitoring" }
  ],
  "isLinear": true,
  "visualHint": "arrow-flow"
}
```

---

### `image` — Image Card

```json
{
  "kind": "image",
  "src": "/data/projects/proj-001/materials/fig3.png",
  "alt": "Market share breakdown pie chart",
  "caption": "Figure 3: Global cloud market share by provider, Q3 2024"
}
```

---

### `code` — Code Card

```json
{
  "kind": "code",
  "language": "typescript",
  "code": "const result = await openai.chat.completions.create({\n  model: 'gpt-4o',\n  messages: [{ role: 'user', content: prompt }]\n})",
  "filename": "src/ai-client.ts",
  "highlight": [2],
  "description": "Minimal OpenAI API call using the official Node.js SDK"
}
```

---

### `idea` — Idea Card

```json
{
  "kind": "idea",
  "body": "Use the existing customer churn prediction model as a base to build a proactive retention campaign engine — triggering personalized offers when churn probability > 0.7"
}
```

### `inspiration` — Inspiration Card

> Produced by the `inspire` skill only.

```json
{
  "kind": "inspiration",
  "body": "The market analysis slide is missing competitive comparison. Use the research skill to search top 5 competitor metrics (market share, growth, MAU) and build a comparison chart page.",
  "ideaType": "improvement",
  "impact": "Adds persuasive competitive context to the core argument slide",
  "difficulty": "easy"
}
```

---

## Kind Selection Priority

When encountering data, select the most specific type:

| Material Content | Recommended kind | Instead of |
|-----------------|-----------------|-----------|
| A set of KPIs/metrics | `data` | writing numbers in `summary` |
| Trend data (≥3 time points) | `chart` | describing trends in `data` |
| Row/column comparison table | `table` | writing text tables in `summary` |
| Multi-step process | `process` | listing steps in `keypoint` |
| A vs B comparison | `comparison` | writing comparisons in `argument` |
| Time-ordered events (≥4) | `timeline` | narrating by time in `summary` |
| Excellent original passage | `quote` | quoting in `summary` |
| Clear opinion + evidence | `argument` | writing opinions in `keypoint` |

---

## Core Principles

1. **Deduplicate first, produce second** — compare every candidate against existingCards; never recreate existing information
2. **Specific over general** — prefer the most specific card kind that fits the data
3. **No data fabrication** — all numbers must come from source materials
4. **Cross-material source isolation** — each card's `sourceId` must accurately reflect its source
5. **Bidirectional linking** — if card A references card B, B must also reference A
6. **Every output has `action`** — `"create"` or `"enrich"`, no exceptions
