---
name: gather-requirements
description: Conduct a structured requirements interview with a user to understand what they want to automate or build, then produce a concise requirements summary for template matching.
license: MIT
compatibility: ">=0.1.0"
allowed-tools: []
metadata:
  author: shadowob
  version: "1.0.0"
  category: discovery
---

# Instructions

## Purpose
Gather enough context from the user to accurately match their needs to a Shadow agent template.

## Interview Flow

Ask the user up to 3 clarifying questions (stop earlier if you have enough information):

1. **Primary goal**: "What is the main thing you want to automate or build?" (e.g., DevOps pipelines, customer support, code review, research, monitoring)
2. **Integrations**: "Which external services does this need to connect to?" (e.g., GitHub, Slack, Notion, Stripe, custom REST API)
3. **Deployment target**: "Where will this run — local laptop (Docker Compose) or cloud (Kubernetes)?"

## Output
After gathering answers, produce a concise requirements summary:

```
Requirements Summary:
- Goal: {primary goal description}
- Integrations: {list of integrations}
- Deployment: {local|cloud|both}
- Scale: {single agent|small team (2-3)|large team (4+)}
- Keywords for search: {3-5 keywords}
```

Pass this summary to the Template Scout's `search-templates` skill.
