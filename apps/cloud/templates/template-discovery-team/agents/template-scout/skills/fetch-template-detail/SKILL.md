---
name: fetch-template-detail
description: Fetch the full configuration for a specific Shadow template by slug. Returns the raw JSON config for downstream use by the Advisor or Deploy Mentor.
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
Retrieve the complete configuration of a template so it can be inspected or used for deployment.

## Steps

1. Call `GET ${env:SHADOW_BASE_URL}/api/cloud/templates/{slug}` with header `Authorization: Bearer ${env:SHADOW_API_TOKEN}`.
2. Return the `content` field from the JSON response — this is the deployable agent configuration.
3. Include a summary of agents found: list each agent's `id` and `runtime`.
4. If the template is not found (HTTP 404), say: "Template '{slug}' not found. Use search-templates to find available slugs."
5. If the API call fails, report the HTTP status and a brief error message.

## Constraints
- Never modify or summarize the raw config — return it verbatim for the Mentor to use.
- Always confirm the slug before fetching — ask the user to confirm if uncertain.
