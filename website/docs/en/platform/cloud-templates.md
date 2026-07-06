---
title: Cloud Templates
description: Official Cloud templates, what each one deploys, and how to author safe deployable templates.
---

# Cloud Templates

A Cloud template is a versioned `*.template.json` file that can create a playable Shadow space: space, channels, Buddies, model provider wiring, skills, scripts, CLI tools, and MCP assets.

Official templates live in `apps/cloud/templates`.

## Official Templates

The official set keeps templates with a concrete runtime capability beyond a prompt-only Buddy shell: agent packs, Claude plugin sources, connector plugins, space apps, scheduled routines, commerce flows, installed skills, or multi-agent workflows.

| Template | What it creates | Agents | Default channels | Plugins | Capability |
| --- | --- | ---: | --- | --- | --- |
| `agent-marketplace-buddy` | Specialist Buddy marketplace for development, security, infrastructure, data, docs, SEO, and workflow orchestration. | 1 | Choose, Build, Review | `model-provider`, `shadowob`, `agent-pack` | pack: `wshobson-agents` |
| `bmad-method-buddy` | BMAD Method agile development space for analysis, planning, delivery, QA, and retros. | 1 | Analysis, Planning, Delivery | `model-provider`, `shadowob`, `agent-pack` | pack: `bmad-method` |
| `claude-ads-buddy` | Paid ads audit space for platform checks, budget modeling, creative review, and tracking issues. | 1 | Audit, Creative, Budget | `model-provider`, `shadowob`, `agent-pack` | pack: `claude-ads` |
| `claude-financial-services-buddy` | Claude financial-services research space using a GitHub-hosted Claude marketplace plugin. | 1 | Research, Deals, Review | `model-provider`, `shadowob`, `claude-plugin` | Claude source: `anthropic-financial-services` |
| `claude-seo-buddy` | Technical SEO and GEO/AEO audit space with SEO skills, scripts, and guidance. | 1 | Audit, Strategy, Technical | `model-provider`, `shadowob`, `agent-pack` | pack: `claude-seo` |
| `code-trainer` | Algorithm training space with a Code Trainer space app, learning channels, scheduled reviews, recommendations, plans, tips, wrong-problem review, and progress reports. | 1 | Assistant News, Recommendations, Learning Plan, Code Review, Wrong Problems, Tips | `model-provider`, `shadowob` | 1 space app, 8 routines |
| `everything-claude-code-buddy` | Engineering harness with skills, commands, agents, hooks, memory, and Codex-compatible guidance. | 1 | Engineering, Review, Ops | `model-provider`, `shadowob`, `agent-pack` | pack: `ecc` |
| `google-workspace-buddy` | Workspace operations space for Gmail, Calendar, Drive, Docs, and Sheets after authorization. | 1 | Inbox, Calendar, Docs | `model-provider`, `google-workspace`, `shadowob` | connector: `google-workspace` |
| `gsd-buddy` | Spec-driven development space for context, milestones, planning, execution, and verification. | 1 | Specs, Execution, Review | `model-provider`, `shadowob`, `agent-pack` | pack: `gsd` |
| `gstack-buddy` | Product-team strategy space with gstack helper scripts mounted from GitHub. | 1 | Office Hours, Weekly Retro | `model-provider`, `shadowob`, `agent-pack` | pack: `gstack` |
| `little-match-girl` | Paid-file MVP with a fairy-tale Buddy and a post-purchase HTML animation unlock. | 1 | match-street | `model-provider`, `shadowob` | commerce |
| `lovart-buddy` | Creative production space connected to Lovart for image, video, audio, canvas, project, and thread workflows. | 1 | Briefs, Assets, Projects | `model-provider`, `lovart`, `shadowob` | connector: `lovart` |
| `marketingskills-buddy` | Growth team space using marketing playbooks for CRO, copy, SEO, paid, email, and decisions. | 1 | General, Briefs | `model-provider`, `shadowob`, `agent-pack` | pack: `marketingskills` |
| `scientific-skills-buddy` | Scientific research space with skills for data analysis, biology, chemistry, medicine, visualization, and writing. | 1 | Research, Analysis, Writing | `model-provider`, `shadowob`, `agent-pack` | pack: `scientific-agent-skills` |
| `seomachine-buddy` | SEO growth space for keyword research, content briefs, on-page audits, and topical authority. | 1 | Keyword Research, Content Briefs, On-page Audits | `model-provider`, `shadowob`, `agent-pack` | pack: `seomachine` |
| `shadow-server-app-demo` | Demo Desk space app, authorized Buddy, and CLI-driven ticket operations with live iframe refresh. | 1 | Operations | `model-provider`, `shadowob` | 1 space app |
| `slavingia-skills-buddy` | Solo operator space for writing, decisions, design taste, and focused execution. | 1 | General, Decisions | `model-provider`, `shadowob`, `agent-pack` | pack: `slavingia-skills` |
| `superclaude-buddy` | Structured development workbench with commands, modes, agents, MCP guidance, and confidence checks. | 1 | General, Commands, Architecture | `model-provider`, `shadowob`, `agent-pack` | pack: `superclaude` |
| `superpowers-buddy` | Engineering-method space for specs, TDD, implementation planning, execution, and review. | 1 | General, Specs, Review | `model-provider`, `shadowob`, `agent-pack` | pack: `superpowers` |
| `video-workshop` | Issue-first AI video production workshop with coordination, research, insight, scripting, rendering, QA, Kanban tracking, Buddy Inbox dispatch, and Workspace video delivery. | 6 | Briefs, Production, QA | `model-provider`, `shadowob`, `skills` | 1 space app, 9 skills |

## Template Shape

```json
{
  "version": "1.0.0",
  "name": "gstack-buddy",
  "title": "gstack Strategy Buddy",
  "description": "A virtual product-team template for strategy, planning, and weekly review.",
  "i18n": {
    "zh-CN": {
      "title": "gstack 战略 Buddy",
      "description": "用于战略、规划和周复盘的虚拟产品团队模板。"
    }
  },
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

## Buddy and Agent Identity Alignment

`shadowob.options.buddies[]` and `deployments.agents[]` describe two sides of the same runnable Buddy: the former is the Shadow community identity, and the latter is the logical agent profile used by the runtime. They must stay paired through `bindings[].agentId`; do not let the visible Buddy identity drift away from the actual agent responsibility.

When the user creates a Cloud Buddy through a new Cloud Buddy entry point, the form's name and description must be written into both places:

- `use[].options.buddies[].name` / `description`, for the Shadow profile, channel member, Inbox, marketplace listing, and other visible identity surfaces.
- The matching `deployments.agents[].identity.name` and `identity.description` or `deployments.agents[].description`, for runtime-generated agent profiles, SOUL/AGENTS files, and responsibility prompts.

If the generated agent uses another name or responsibility, the user sees one Buddy while the runtime behaves as another agent. Inbox cards, marketplace copy, logs, and model instructions then become detached from each other. Single-Buddy templates should generate the Buddy id, binding `agentId`, Agent id, display name, and responsibility together; multi-agent templates must validate that pairing for every Buddy.

```json
{
  "use": [
    {
      "plugin": "shadowob",
      "options": {
        "buddies": [
          {
            "id": "strategy-buddy",
            "name": "Strategy Buddy",
            "description": "Helps founders turn product signals into weekly strategy decisions."
          }
        ],
        "bindings": [
          {
            "targetId": "strategy-buddy",
            "targetType": "buddy",
            "agentId": "strategy-buddy",
            "servers": ["gstack-hq"],
            "channels": ["office-hours"]
          }
        ]
      }
    }
  ],
  "deployments": {
    "agents": [
      {
        "id": "strategy-buddy",
        "runtime": "openclaw",
        "description": "Helps founders turn product signals into weekly strategy decisions.",
        "identity": {
          "name": "Strategy Buddy",
          "description": "Helps founders turn product signals into weekly strategy decisions.",
          "systemPrompt": "You are Strategy Buddy. Help founders turn product signals into weekly strategy decisions."
        }
      }
    ]
  }
}
```

## Secrets and Variables

| Syntax | Meaning |
| --- | --- |
| `i18n.title` / `i18n.description` | Locale-specific template text overrides; `title` / `description` must contain real default text. |
| `${env:VAR_NAME}` | Local environment variable used by CLI deploys. |
| `${secret:k8s/secret-name/key}` | Kubernetes Secret reference. |

Never place raw API keys in a template. Use env variables, platform secret groups, provider profiles, or secret references.

## Publish Checklist

1. Validate with `shadowob-cloud validate --strict`.
2. Confirm all visible text has i18n values.
3. Confirm every Buddy binding points to a deployed agent.
4. Confirm every Buddy's name, description, and responsibility match the bound agent identity.
5. Confirm the default channel exists and is the landing target.
6. Confirm secrets are references, not inline values.
7. Deploy once in a clean cluster and send a test message to the Buddy.

Strong templates are more than chat windows. Add scripts, skills, CLI commands, MCP tools, scheduled tasks, or approval flows when they make the play useful.
