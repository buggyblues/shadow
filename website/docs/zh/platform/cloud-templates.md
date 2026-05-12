---
title: Cloud 模版
description: 虾豆 Cloud 官方模版、每个模版部署什么，以及如何编写安全可部署的模版。
---

# Cloud 模版

Cloud 模版是版本化的 `*.template.json` 文件，可以创建一个可玩的虾豆空间：服务器、频道、Buddy、模型供应商接线、技能、脚本、CLI 工具和 MCP 资产。

官方模版位于 `apps/cloud/templates`。

## 官方模版

| 模版 | 创建内容 | 默认频道 | 插件 |
| --- | --- | --- | --- |
| `agent-marketplace-buddy` | 专家 agent 市场空间，覆盖开发、安全、基础设施、数据、文档、SEO 和流程编排。 | Choose, Build, Review | `model-provider`, `shadowob` |
| `ai-werewolf` | AI 游戏主持空间，负责身份、节奏、投票和复盘。 | Lobby, Table, Recap | `model-provider`, `shadowob` |
| `bmad-method-buddy` | BMAD Method 敏捷开发空间，覆盖分析、计划、交付、QA 和复盘。 | Analysis, Planning, Delivery | `model-provider`, `shadowob` |
| `brain-fix` | 一分钟呼吸、专注和复盘空间。 | Reset, Focus, Reflect | `model-provider`, `shadowob` |
| `claude-ads-buddy` | 付费广告审计空间，支持平台检查、预算建模、创意评审和追踪问题。 | Audit, Creative, Budget | `model-provider`, `shadowob` |
| `claude-seo-buddy` | 技术 SEO 与 GEO/AEO 审计空间，包含 SEO 技能、脚本和指引。 | Audit, Strategy, Technical | `model-provider`, `shadowob` |
| `code-arena` | 编程挑战空间，支持出题、限时对战、提示和复盘。 | Problems, Arena, Review | `model-provider`, `shadowob` |
| `daily-brief` | 晨间简报空间，覆盖全球新闻、科技、市场和个人重点。 | Morning, Markets, Technology | `model-provider`, `shadowob` |
| `e-wife` | 陪伴型生活空间，支持日常问候、轻量记忆和计划。 | Daily, Memory, Plans | `model-provider`, `shadowob` |
| `everything-claude-code-buddy` | 工程 harness，包含 skills、commands、agents、hooks、memory 和 Codex 兼容规则。 | Engineering, Review, Ops | `model-provider`, `shadowob` |
| `financial-freedom` | 财务自由测算空间，支持现金流、支出澄清和里程碑规划。 | Snapshot, Roadmap, Habits | `model-provider`, `shadowob` |
| `gitstory` | 软件历史空间，把提交、发布和决策转成可读故事。 | Commits, Chapters, Retros | `model-provider`, `shadowob` |
| `google-workspace-buddy` | Workspace 办公空间，授权后支持 Gmail、Calendar、Drive、Docs 和 Sheets。 | Inbox, Calendar, Docs | `model-provider`, `google-workspace`, `shadowob` |
| `gsd-buddy` | 规格驱动开发空间，支持上下文、里程碑、计划、执行和验证。 | Specs, Execution, Review | `model-provider`, `shadowob` |
| `gstack` | 创业战略空间，支持想法验证、竞争分析和融资材料打磨。 | Idea, Market, Pitch | `model-provider`, `shadowob` |
| `gstack-buddy` | 产品团队战略空间，从 GitHub 挂载 gstack 辅助脚本。 | Office Hours, Weekly Retro | `model-provider`, `shadowob` |
| `marketingskills-buddy` | 增长团队空间，使用 CRO、文案、SEO、付费、邮件和增长 playbook。 | General, Briefs | `model-provider`, `shadowob` |
| `retire-buddy` | 退休规划空间，支持生活设计、财务路径和日常陪伴。 | Life Plan, Money Map, Daily Care | `model-provider`, `shadowob` |
| `scientific-skills-buddy` | 科研空间，包含数据分析、生物、化学、医学、可视化和写作技能。 | Research, Analysis, Writing | `model-provider`, `shadowob` |
| `seomachine-buddy` | SEO 增长空间，支持关键词研究、内容简报、站内审计和主题权威规划。 | Keyword Research, Content Briefs, On-page Audits | `model-provider`, `shadowob` |
| `slavingia-skills-buddy` | 独立操作者空间，支持写作、决策、设计品味和专注执行。 | General, Decisions | `model-provider`, `shadowob` |
| `superclaude-buddy` | 结构化开发工作台，包含命令、模式、agents、MCP 指引和信心检查。 | General, Commands, Architecture | `model-provider`, `shadowob` |
| `superpowers-buddy` | 工程方法空间，支持规格、TDD、实现计划、执行和审查。 | General, Specs, Review | `model-provider`, `shadowob` |
| `world-pulse` | 全球事件信号空间，提供简洁摘要、背景和追问线索。 | Headlines, Signals, Context | `model-provider`, `shadowob` |

## 模版结构

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

## 密钥和变量

| 写法 | 含义 |
| --- | --- |
| `${i18n:title}` | 多语言模版文案。 |
| `${env:VAR_NAME}` | CLI 部署时使用的本地环境变量。 |
| `${secret:k8s/secret-name/key}` | Kubernetes Secret 引用。 |

不要把原始 API key 写进模版。使用环境变量、平台密钥组、供应商配置或 secret 引用。

## 发布检查

1. 运行 `shadowob-cloud validate --strict`。
2. 确认所有可见文案都有 i18n。
3. 确认每个 Buddy 绑定指向已部署 agent。
4. 确认默认频道存在并作为落地目标。
5. 确认密钥是引用，不是明文。
6. 在干净集群部署一次，并给 Buddy 发送测试消息。

强模板不只是聊天窗口。脚本、技能、CLI 命令、MCP 工具、定时任务和审批流程，都可以成为玩法的一部分。
