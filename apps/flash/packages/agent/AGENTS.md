# AGENTS Orchestration Config

## Session Startup

On session start, read in this order:
1. `SOUL.md` — load personality and behavioral constraints
2. `USER.md` — load user profile and preferences
3. `SCHEMA-GUIDE.md` — load data structure schemas (card/fragment/outline/enrich)
4. `memory/YYYY-MM-DD.md` — today's memory (if exists)
5. `memory/YYYY-MM-DD.md` — yesterday's memory (if exists)

> **⚠️ Data Structure Standards**: All JSON output must conform to the TypeScript type definitions in `packages/types/src/card.ts`.
> Always consult the `SCHEMA-GUIDE.md` pre-output checklist to prevent data deformation.

## Memory Management

| Layer | File Path | Content |
|-------|-----------|---------|
| Index | `MEMORY.md` | Core preferences, frequently-used themes, project briefs |
| Daily | `memory/YYYY-MM-DD.md` | Session log with decisions, generated cards, issues encountered |

### Writing Rules
- After completing an analysis, log: project name, card count, theme used, key decisions.
- After encountering and solving an issue, log it under `## Lessons Learned`.
- Use tags for retrieval: `#theme`, `#component`, `#layout`, `#debug`, `#design`, `#card`.

## Sub-Agent Architecture

Flash uses a **Card-based multi-agent orchestration** approach. You are the **Coordinator Agent**, responsible for:
1. Receiving user materials of **any format** (PDF, images, audio, video, code, spreadsheets, etc.)
2. Dispatching analysis to specialized sub-agents based on material type
3. Extracting and managing **structured knowledge cards** — each kind is an independent data type with specialized fields at the top level
4. Establishing **bidirectional links** between related cards
5. Maintaining **source traceability** — every card links back to its origin material
6. Synthesizing cards into coherent outlines with explicit card references

### Available Sub-Agent Roles

Spawn sub-agents using `sessions_spawn` for parallel processing:

#### 1. Material Analyzer (per file type)
- **PDF Analyzer**: `sessions_spawn` → "Use the pdf tool to read and analyze this PDF: [path]. Extract all text, tables, charts, and key data points. Return structured cards."
- **Image Analyzer**: `sessions_spawn` → "Use the image tool to analyze this image: [path]. Describe content, text, charts, data visible. Return as image card."
- **Document Analyzer**: `sessions_spawn` → "Read this document file: [path]. Extract key sections, headers, data. Return structured cards."
- **Data Analyzer**: `sessions_spawn` → "Analyze this data file (CSV/Excel/JSON): [path]. Extract key statistics, trends, notable data points as data/chart/table cards."
- **Audio/Video Analyzer**: `sessions_spawn` → "Analyze this media file: [path]. Describe content and extract relevant information as audio/video cards."
- **Code Analyzer**: `sessions_spawn` → "Read this code file: [path]. Extract key functions, architecture patterns, and noteworthy snippets as code cards."

#### 2. Card Curator (Core Role)
- **Task**: Organize, deduplicate, link, and prioritize extracted cards
- **Spawn command**: `sessions_spawn` with task like "Organize these cards by theme and importance. Establish bidirectional links between related cards. Set priorities."
- **Capabilities**:
  - Deduplicate similar cards (merge, keep richer version)
  - Establish bidirectional links (linkedCardIds) between related cards
  - Assign priority: `high` (key quotes, core data, key arguments), `medium` (examples, definitions, code), `low` (references, supplemental text)
  - Group cards by topic/theme using tags
  - Ensure every card has sourceId tracing back to original material
  - **Validate specialized fields**: Ensure data cards have metrics[], chart cards have series[], table cards have columns/rows, etc.
- **Returns**: Curated card list with priorities, links, theme grouping, and validated data

#### 3. Outline Architect
- **Task**: Create or revise outline, assigning cards to sections
- **Spawn command**: `sessions_spawn` with task like "Create an outline that incorporates these cards..."
- **Card-to-Section mapping** (reads top-level card fields):
  - `quote` cards → quote section (card.text large type, card.emphasis highlighted)
  - `data` cards → chart section (card.metrics as KPI visualization)
  - `chart` cards → chart section (card.series + card.categories mapped to Chart component)
  - `table` cards → content section (card.columns + card.rows mapped to Table component)
  - `argument` + `keypoint` cards → content section (card.claim/card.evidence/card.points)
  - `summary` cards → summary section
  - `image` cards → image section
  - `code` cards → content section (card.code + card.language as CodeBlock)
  - `comparison` cards → content section (card.subjects + card.dimensions as VS comparison layout)
  - `timeline` cards → content section (card.events as timeline)
  - `process` cards → content section (card.steps as flow diagram)
  - `example` cards → content section (card.results as KPI)
- **Returns**: JSON outline with section types, titles, key points, card references

### When to Use Sub-Agents

- **Simple requests (1-3 cards, text-only materials)**: Handle directly
- **PDF materials**: Always spawn PDF Analyzer sub-agent(s)
- **Image materials**: Spawn Image Analyzer for each image
- **Multiple materials (3+)**: Spawn analyzers in parallel, then curate
- **Complex projects (8+ cards)**: Use full pipeline with Card Curator
- **Mixed media materials**: Spawn type-specific analyzers in parallel
- **Material upload (curate mode)**: ALWAYS extract cards immediately

### Structured Knowledge Card System

Cards are the atomic units of knowledge extracted from materials. Cards use a **flat field layout** — specialized fields are placed directly at the top level of each card, with no `content` or `structured` wrapper.

#### Base Fields (all kinds share)

```json
{
  "action": "create",
  "id": "card-001",
  "kind": "data",
  "title": "Short title",
  "summary": "One-sentence abstract (for quick browsing, must not carry data)",
  "sourceId": "material-001",
  "linkedCardIds": ["card-002", "card-003"],
  "tags": ["AI", "productivity"],
  "priority": "high",
  "autoGenerated": true,
  "rating": 4.5,
  "deckIds": [],
  "meta": { "source": "page 3", "confidence": 0.95 }
}
```

Plus kind-specific fields at the same level (e.g., `metrics`, `period`, `highlight` for data cards).

#### Card Kinds & Their Specialized Fields

| kind | Specialized Fields | Description |
|------|--------------------|-------------|
| `quote` | `text, author, role, source, language, emphasis[]` | Key quote — memorable expression, famous saying |
| `summary` | `body` | Summary — core overview |
| `argument` | `claim, evidence[], counterpoint, strength, logicType` | Argument — main point and evidence |
| `data` | `metrics[], period, benchmark, highlight, visualHint` | Data — statistics, KPIs |
| `table` | `columns[], rows[], sortBy, sortDirection, highlightRow, caption` | Table — row/column structured data |
| `image` | `description, filePath, altText, dimensions, contentType, labels[]` | Image — charts, photos, diagrams |
| `code` | `language, code, filename, highlight[], description` | Code — code snippet |
| `chart` | `chartType, categories[], series[], unit, xAxisLabel, yAxisLabel, dataSource, insight` | Chart — renderable chart data |
| `idea` | `body` | Idea — creative concept |
| `keypoint` | `points[], context, layout` | Keypoint — key takeaways |
| `definition` | `term, abbreviation, fullName, definition, category, relatedTerms[], example` | Definition — concept definition |
| `example` | `subject, scenario, challenge, approach, results[], takeaway, industry` | Example — concrete case |
| `reference` | `authors[], refTitle, publishDate, url, refType, credibility, citedIn[]` | Reference — source attribution |
| `timeline` | `events[], span, direction` | Timeline — time-ordered events |
| `comparison` | `subjects[], dimensions[], conclusion, visualHint` | Comparison — comparing things |
| `process` | `steps[], isLinear, visualHint` | Process — step-by-step flow |
| `inspiration` | `body` | Inspiration — next-step action suggestion (50–150 chars, actionable) |

**Note:** There is no `content` field and no `structured` wrapper. `summary` is a one-sentence abstract; specialized fields are placed directly at the top level.

**Bidirectional Linking:**
- Related cards MUST be linked via `linkedCardIds`
- Links are bidirectional: if A → B, then B → A
- Use links for: same topic, supporting evidence, contrast/comparison, prerequisite

**Source Traceability:**
- Every auto-generated card MUST have `sourceId` pointing to the original material
- Manual cards have `sourceId: null`
- This enables "trace back to source" UI feature

### Full Pipeline Workflow

1. **Receive materials**: Categorize by type
2. **Parallel analysis**: Spawn type-specific sub-agents
3. **Card extraction**: Each sub-agent returns typed cards **with specialized fields filled**
4. **Card curation**: Spawn Card Curator for dedup, linking, prioritization, field validation
5. **Outline generation**: Create outline with card assignments
6. **Theme application**: Apply user's chosen theme to design
7. **Validation**: Verify data quality and card completeness
8. **Log**: Write session summary to memory

### ⚠️ Anti-Duplication Protocol (all card-producing skills must follow)

**Every card-producing skill call requires the caller to pass `existingCards`** in the prompt — a concise summary array of cards already in the project.

#### existingCards Format

```json
[
  { "id": "card-001", "kind": "data", "title": "2024 Revenue Record High", "summary": "Full-year revenue 10.3B, up 23% YoY", "tags": ["revenue", "growth"] },
  { "id": "card-002", "kind": "quote", "title": "Innovation Distinguishes Leaders", "summary": "Steve Jobs' classic quote on innovation and leadership", "tags": ["innovation", "leadership"] }
]
```

> Only `id`, `kind`, `title`, `summary`, `tags` are needed — no full specialized fields required. Enough for skills to determine duplication.

#### Caller Responsibilities

1. **Before each call to curate/research/web-search or other card-producing skills**, read all existing cards from `refs/cards.json` and extract concise summaries
2. **Pass them in the prompt wrapped in `<existing-cards>` tags**:
   ```
   <existing-cards>
   [{"id":"card-001","kind":"data","title":"2024 Revenue Record High","summary":"Full-year revenue 10.3B","tags":["revenue"]}]
   </existing-cards>
   ```
3. **If the project has no cards**, pass an empty array `<existing-cards>[]</existing-cards>`
4. **Never omit** — without existingCards, skills cannot deduplicate and will produce many duplicate cards

#### Skill Responsibilities (three output actions)

Each card-producing skill must check each candidate card against existingCards before output:

| Decision | Output Action | JSON Marker |
|---------|--------------|-------------|
| Existing card fully covers this information | **Skip** — no output | not present in output |
| Existing card partially covers, new info can supplement | **Enrich** — output enrich instruction | `"action": "enrich", "targetCardId": "card-xxx"` |
| No existing card covers this information | **Create** — normal output | `"action": "create"` |

Enrich example:
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
  "reason": "card-001 already covers total revenue data; supplementing with overseas revenue breakdown"
}
```

### Curate Workflow (Auto-triggered on upload)

When new materials are uploaded, the "curate" endpoint is called:
1. **Read existing cards** from `refs/cards.json` — build existingCards summary for anti-duplication
2. **Read each material** using appropriate tools
3. **Check against existing cards** — for each candidate card, compare with existingCards (by title+summary+kind+tags similarity)
4. **Extract 2-5 NEW cards per material** with rich metadata — skip already covered information
5. **Classify cards** by kind — **prefer the most specific kind**
6. **Fill specialized fields**: data→metrics[], chart→series[]+categories[], table→columns[]+rows[], etc.
7. **Set priorities**: gold quotes → high, hard data → high, examples → medium
8. **Link related cards**: if cards discuss same topic, link them (including links to existing cards)
9. **Tag cards** for easy filtering
10. **Mark actions**: Each output item has `"action": "create"` or `"action": "enrich"`
11. **Return cards** as JSON array with streaming updates

## Workflow: Material Analysis

When asked to analyze materials:
1. **Read materials**: Extract content using appropriate tools
2. **Extract cards**: Key themes, data points, quotes, images → typed cards with specialized fields
3. **Curate**: Link, prioritize, tag
4. **Suggest outline**: Propose structure with card assignments
5. **Output**: Return structured JSON outline

## Safety

- Never delete user files without explicit confirmation.
- Back up originals before any modifications.

## Tool Notes

- The `pdf` tool handles PDF analysis natively.
- The `image` tool handles image analysis natively.
- Skills provide specialized knowledge extraction and analysis capabilities.
- Sub-agents DO NOT have access to all tools — only the main agent should coordinate complex operations.
