---
title: Cloud Templates
description: Official Shadow Cloud templates, what each one deploys, and how to author safe deployable templates.
---

# Cloud Templates

A Cloud template is a versioned `*.template.json` file that can create a playable Shadow space: server, channels, Buddies, model provider wiring, skills, scripts, CLI tools, and MCP assets.

Official templates live in `apps/cloud/templates`.

## Official Templates

| Template | What it creates | Default channels | Plugins |
| --- | --- | --- | --- |
| `agent-marketplace-buddy` | Specialist-agent marketplace for development, security, infrastructure, data, docs, SEO, and workflow orchestration. | Choose, Build, Review | `model-provider`, `shadowob` |
| `ai-werewolf` | AI game host for roles, pacing, voting, and recap. | Lobby, Table, Recap | `model-provider`, `shadowob` |
| `bmad-method-buddy` | BMAD Method agile development space for analysis, planning, delivery, QA, and retros. | Analysis, Planning, Delivery | `model-provider`, `shadowob` |
| `brain-fix` | One-minute reset space for breathing, focus, and reflection. | Reset, Focus, Reflect | `model-provider`, `shadowob` |
| `claude-ads-buddy` | Paid ads audit space for platform checks, budget modeling, creative review, and tracking issues. | Audit, Creative, Budget | `model-provider`, `shadowob` |
| `claude-seo-buddy` | Technical SEO and GEO/AEO audit space with SEO skills, scripts, and guidance. | Audit, Strategy, Technical | `model-provider`, `shadowob` |
| `code-arena` | Coding challenge space for problems, timed battles, hints, and review. | Problems, Arena, Review | `model-provider`, `shadowob` |
| `daily-brief` | Morning brief space for global news, technology, markets, and personal focus. | Morning, Markets, Technology | `model-provider`, `shadowob` |
| `e-wife` | Companion-style life space for daily check-ins, memory, and small plans. | Daily, Memory, Plans | `model-provider`, `shadowob` |
| `everything-claude-code-buddy` | Engineering harness with skills, commands, agents, hooks, memory, and Codex-compatible guidance. | Engineering, Review, Ops | `model-provider`, `shadowob` |
| `financial-freedom` | Runway, spending clarity, and milestone planning space. | Snapshot, Roadmap, Habits | `model-provider`, `shadowob` |
| `gitstory` | Software history space that turns commits, releases, and decisions into readable stories. | Commits, Chapters, Retros | `model-provider`, `shadowob` |
| `google-workspace-buddy` | Workspace operations space for Gmail, Calendar, Drive, Docs, and Sheets after authorization. | Inbox, Calendar, Docs | `model-provider`, `google-workspace`, `shadowob` |
| `gsd-buddy` | Spec-driven development space for context, milestones, planning, execution, and verification. | Specs, Execution, Review | `model-provider`, `shadowob` |
| `gstack` | Founder strategy space for idea validation, competitive mapping, and pitch shaping. | Idea, Market, Pitch | `model-provider`, `shadowob` |
| `gstack-buddy` | Product-team strategy space with gstack helper scripts mounted from GitHub. | Office Hours, Weekly Retro | `model-provider`, `shadowob` |
| `marketingskills-buddy` | Growth team space using marketing playbooks for CRO, copy, SEO, paid, email, and decisions. | General, Briefs | `model-provider`, `shadowob` |
| `retire-buddy` | Retirement planning space for life design, financial runway, and daily companionship. | Life Plan, Money Map, Daily Care | `model-provider`, `shadowob` |
| `scientific-skills-buddy` | Scientific research space with skills for data analysis, biology, chemistry, medicine, visualization, and writing. | Research, Analysis, Writing | `model-provider`, `shadowob` |
| `seomachine-buddy` | SEO growth space for keyword research, content briefs, on-page audits, and topical authority. | Keyword Research, Content Briefs, On-page Audits | `model-provider`, `shadowob` |
| `slavingia-skills-buddy` | Solo operator space for writing, decisions, design taste, and focused execution. | General, Decisions | `model-provider`, `shadowob` |
| `superclaude-buddy` | Structured development workbench with commands, modes, agents, MCP guidance, and confidence checks. | General, Commands, Architecture | `model-provider`, `shadowob` |
| `superpowers-buddy` | Engineering-method space for specs, TDD, implementation planning, execution, and review. | General, Specs, Review | `model-provider`, `shadowob` |
| `world-pulse` | World news signal space for concise summaries, context, and follow-up questions. | Headlines, Signals, Context | `model-provider`, `shadowob` |

## Template Shape

```json
{
  "version": "1.0.0",
  "name": "gstack-buddy",
  "title": "${i18n:title}",
  "description": "${i18n:description}",
  "use": [
    { "plugin": "model-provider" },
    {
      "plugin": "shadowob",
      "options": {
        "servers": [
          {
            "id": "gstack-hq",
            "name": "gstack",
            "slug": "gstack",
            "channels": [
              { "id": "office-hours", "title": "Office Hours", "type": "text" }
            ]
          }
        ],
        "buddies": [{ "id": "strategy-buddy", "name": "Strategy Buddy" }],
        "bindings": [
          {
            "targetId": "strategy-buddy",
            "targetType": "buddy",
            "servers": ["gstack-hq"],
            "channels": ["office-hours"],
            "agentId": "strategy-buddy"
          }
        ]
      }
    }
  ],
  "deployments": {
    "namespace": "gstack-buddy",
    "agents": [
      {
        "id": "strategy-buddy",
        "runtime": "openclaw",
        "identity": {
          "name": "Strategy Buddy",
          "systemPrompt": "Use the mounted gstack instructions before advising."
        }
      }
    ]
  }
}
```

## Secrets and Variables

| Syntax | Meaning |
| --- | --- |
| `${i18n:title}` | Locale-aware template text. |
| `${env:VAR_NAME}` | Local environment variable used by CLI deploys. |
| `${secret:k8s/secret-name/key}` | Kubernetes Secret reference. |

Never place raw API keys in a template. Use env variables, platform secret groups, provider profiles, or secret references.

## Publish Checklist

1. Validate with `shadowob-cloud validate --strict`.
2. Confirm all visible text has i18n values.
3. Confirm every Buddy binding points to a deployed agent.
4. Confirm the default channel exists and is the landing target.
5. Confirm secrets are references, not inline values.
6. Deploy once in a clean cluster and send a test message to the Buddy.

Strong templates are more than chat windows. Add scripts, skills, CLI commands, MCP tools, scheduled tasks, or approval flows when they make the play useful.
