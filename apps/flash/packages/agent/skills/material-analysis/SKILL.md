---
name: material-analysis
description: Analyze uploaded materials and extract structured content fragments — intelligent parsing for any file format.
version: 3.0.0
metadata:
  openclaw:
    emoji: "📂"
---

# Material Analysis Skill — Material Analysis & Fragment Extraction

Analyze uploaded materials in **any format** and extract structured content fragments (Fragments), providing raw data for the subsequent curate stage.

> **📋 Data Structure Standard**: Fragments must conform to the `Fragment` type in `packages/types/src/card.ts`. Consult `SCHEMA-GUIDE.md` for fragment field quick reference.

## When to Use

The caller activates this skill when:
- The user uploads one or more files in any format
- The user asks to "analyze materials", "parse files", or "extract content"
- Pre-processing stage before curate

---

## General Analysis Workflow

1. **Identify file type** → select the appropriate tool and parsing strategy
2. **Extract raw content** → read/parse the file
3. **Identify fragments** → break content into atomic information pieces
4. **Classify fragments** → assign a `kind` to each fragment
5. **Output structured summary** → includes all fragments and cross-material theme analysis

---

## File Type Handling Guide

### PDF Files
1. Use the `pdf` tool: `pdf("/path/to/file.pdf", "Extract all text, tables, charts, and key data")`
2. Extract page by page: text fragments, chart/image location annotations
3. Tables → `data` fragments (with structured metrics or columns/rows)
4. Charts → `image` fragments
5. Key paragraphs → `text` fragments

### Text / Markdown Files
1. Use the `read` tool to read file content directly
2. Headings → section `text` fragments
3. Lists → `text` fragments (by section)
4. Code blocks → `code` fragments
5. Emphasized/bold text → `quote` or `idea` fragments

### Image Files (PNG/JPG/SVG/WebP/GIF)
1. Use the `image` tool to analyze visual content
2. Describe: subject, text, charts, visible data
3. Output as `image` fragment including description and file path

### Audio Files (MP3/WAV/OGG/M4A)
1. Record file path and duration (if determinable)
2. If transcript text is available, extract as `text` fragment
3. Output as `audio` fragment with description

### Video Files (MP4/MOV/WebM)
1. Record file path and duration
2. Describe probable content based on filename/context
3. Output as `video` fragment with description

### Data Files (CSV/JSON/XLSX)
1. Read and parse the data
2. Identify key columns/fields → `data` fragments (**with structured metrics or columns/rows**)
3. Calculate key statistics → `data` fragments
4. Significant trends → `chart` fragments (**with chartType + categories + series**)
5. Notable anomalies → `idea` fragments

### Code Files (JS/TS/Python/Go, etc.)
1. Read code content
2. Identify key functions/classes → `code` fragments (**with language + code text**)
3. Extract architecture patterns → `idea` fragments
4. Notable algorithms → `code` fragments

### Word Documents (DOCX)
1. Read and extract text content
2. Headings/sections → `text` fragments
3. Tables → `data` fragments (**with columns/rows structure**)
4. Images (if extractable) → `image` fragments

### URL Links
1. Use web fetch / browser tool to retrieve page content
2. Extract body text → `text` fragments
3. Key quotations → `quote` fragments
4. Data/statistics → `data` fragments

---

## Fragment Data Structure

Fragments are **intermediate products** of material analysis, subsequently converted to formal knowledge cards in the curate stage.

```json
{
  "id": "frag-001",
  "materialId": "mat-001",
  "kind": "data",
  "title": "Short descriptive title",
  "content": "Raw extracted content (text)",
  "data": {},
  "metadata": {
    "source": "page 3",
    "importance": "high"
  }
}
```

### Fragment Field Description

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Fragment ID, format `frag-<number>` |
| `materialId` | ✅ | Source material ID |
| `kind` | ✅ | Fragment type (see below) |
| `title` | ✅ | Short title |
| `content` | ✅ | Raw extracted text content |
| `data` | — | **Structured data pre-extraction** (see below) |
| `metadata` | ✅ | Metadata (source location, importance level) |

### `data` Field — Structured Pre-Extraction

**Extract structured data at the fragment stage whenever possible** to reduce work in the curate stage:

| Fragment kind | data field content |
|--------------|-------------------|
| `data` | `{ "metrics": [...], "period": "...", "benchmark": "..." }` |
| `chart` | `{ "chartType": "...", "categories": [...], "series": [...] }` |
| `table` | `{ "columns": [...], "rows": [...] }` |
| `quote` | `{ "text": "...", "author": "...", "source": "..." }` |
| `code` | `{ "language": "...", "code": "...", "filename": "..." }` |
| `text` | `null` (plain text; content field is sufficient) |
| `image` | `{ "description": "...", "contentType": "...", "labels": [...] }` |
| `idea` | `null` (plain text) |
| `audio` | `null` |
| `video` | `null` |

### Fragment Types

| kind | Description | Source scenario |
|------|-------------|----------------|
| `text` | Text paragraph | Document body, headings, lists |
| `image` | Image/visual content | Image files, embedded images in documents |
| `data` | Data/statistics | Tables, CSV, chart data |
| `chart` | Trend data suitable for charting | Multi-time-point data, multi-series comparison |
| `table` | Structured table | Document/Excel tables |
| `quote` | Quotation/notable phrase | Emphasized text, citations |
| `idea` | Creative insight | Architecture patterns, trends, anomalies |
| `code` | Code snippet | Code files, code blocks in documents |
| `audio` | Audio content | Audio files |
| `video` | Video content | Video files |

---

## Analysis Output Format

After analyzing all materials, produce a structured summary:

```markdown
## Material Analysis Summary

### Material: [filename]
- **Type**: [file type]
- **Core Theme**: [1–2 sentence summary]
- **Fragments Extracted**: [count]

#### Fragment List:
1. [kind] **[title]**: [brief description] {structured data pre-extracted: ✅/—}
2. [kind] **[title]**: [brief description] {structured data pre-extracted: ✅/—}

### Cross-Material Theme Analysis
- [theme connection findings]
- [narrative thread suggestions]
- [content gap notes]
```

---

## Outline Generation Suggestion

After fragment extraction, suggest a presentation outline structure:

1. **Cover (cover)**: Derive title + subtitle from the main theme
2. **Background/Problem**: Why this topic matters (assign relevant fragments)
3. **Core Content**: 2–5 content pages organized by theme (assign fragments)
4. **Data/Evidence**: Charts, statistics (assign data/chart/table fragments)
5. **Conclusion**: Synthesis and call to action
6. **Ending (ending)**: Acknowledgments / Q&A

Output the outline as a JSON array with fragment references:

```json
[
  {
    "id": "slide-001",
    "slideIndex": 0,
    "title": "Page Title",
    "type": "cover",
    "keyPoints": ["Key point 1", "Key point 2"],
    "materialRefs": ["mat-001"],
    "cardRefs": ["card-001", "card-003"],
    "notes": "Design notes"
  }
]
```

---

## Core Principles

1. **Comprehensive extraction** — do not miss any valuable information fragment
2. **Faithful to source** — fragment content must faithfully represent the original material
3. **Accurate classification** — every fragment's `kind` must be correct
4. **Structured early** — pre-extract structured information in the `data` field for data/chart/table/code fragments
5. **Cross-material linking** — identify thematic connections between different materials
6. **Importance annotation** — use `metadata.importance` to mark fragment importance level
