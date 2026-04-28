---
name: search-templates
description: Search the Shadow community template store by keyword, tag, or use-case description. Calls GET /api/cloud/templates, filters results locally, and returns a structured list of matching templates.
license: MIT
compatibility: ">=0.1.0"
allowed-tools:
  - WebFetch
metadata:
  author: shadowob
  version: "1.0.0"
  category: discovery
---

# Instructions

## Purpose
Search the Shadow template store and return a filtered, structured list of matching templates.

## Steps

1. Call `GET ${env:SHADOW_BASE_URL}/api/cloud/templates` with header `Authorization: Bearer ${env:SHADOW_API_TOKEN}`.
2. Parse the JSON response — it is an array where each entry has: `name`, `title`, `description`, `agentCount`, `namespace`.
3. Filter entries by matching the user's search keywords (case-insensitive) against `name`, `title`, and `description`.
4. Return at most 10 results, formatted as:

```
📦 Found N matching templates:

1. **{title}** (`{name}`)
   {description}
   Agents: {agentCount} · Namespace: {namespace}
```

5. If no results match, say: "No templates matched '{keywords}'. Try broader keywords or ask me to list all templates."
6. If the API call fails, report: "Template store unavailable (HTTP {status}). Please try again later."

## Constraints
- Never invent or fabricate template names. Only report what the API returns.
- Always include the `name` (slug) field — the Advisor and Mentor need it for handoff.
