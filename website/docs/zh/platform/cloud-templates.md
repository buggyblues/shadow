---
title: Cloud 模版
description: 虾豆 Cloud 官方模版、每个模版部署什么，以及如何编写安全可部署的模版。
---

# Cloud 模版

Cloud 模版是版本化的 `*.template.json` 文件，可以创建一个可玩的虾豆空间：服务器、频道、Buddy、模型供应商接线、技能、脚本、CLI 工具和 MCP 资产。

官方模版位于 `apps/cloud/templates`。

## 官方模版

官方集合只保留在 prompt-only Buddy 外壳之外具备实际运行能力的模版：agent pack、Claude plugin source、connector plugin、server app、定时 routine、commerce flow、已安装 skills 或多 agent workflow。

| 模版 | 创建内容 | Agents | 默认频道 | 插件 | 能力 |
| --- | --- | ---: | --- | --- | --- |
| `agent-marketplace-buddy` | 专家 agent 市场空间，覆盖开发、安全、基础设施、数据、文档、SEO 和流程编排。 | 1 | Choose, Build, Review | `model-provider`, `shadowob`, `agent-pack` | pack: `wshobson-agents` |
| `bmad-method-buddy` | BMAD Method 敏捷开发空间，覆盖分析、计划、交付、QA 和复盘。 | 1 | Analysis, Planning, Delivery | `model-provider`, `shadowob`, `agent-pack` | pack: `bmad-method` |
| `claude-ads-buddy` | 付费广告审计空间，支持平台检查、预算建模、创意评审和追踪问题。 | 1 | Audit, Creative, Budget | `model-provider`, `shadowob`, `agent-pack` | pack: `claude-ads` |
| `claude-financial-services-buddy` | 金融服务研究空间，使用 GitHub 托管的 Claude marketplace plugin。 | 1 | Research, Deals, Review | `model-provider`, `shadowob`, `claude-plugin` | Claude source: `anthropic-financial-services` |
| `claude-seo-buddy` | 技术 SEO 与 GEO/AEO 审计空间，包含 SEO 技能、脚本和指引。 | 1 | Audit, Strategy, Technical | `model-provider`, `shadowob`, `agent-pack` | pack: `claude-seo` |
| `code-trainer` | 算法训练空间，包含 Code Trainer server app、学习频道、定时复盘、题目推荐、学习计划、技巧推送、错题回炉和进度报告。 | 1 | 助教资讯, 题目推荐, 学习规划, 代码复盘, 错题回炉, 算法小技巧 | `model-provider`, `shadowob` | 1 server app, 8 routines |
| `everything-claude-code-buddy` | 工程 harness，包含 skills、commands、agents、hooks、memory 和 Codex 兼容规则。 | 1 | Engineering, Review, Ops | `model-provider`, `shadowob`, `agent-pack` | pack: `ecc` |
| `google-workspace-buddy` | Workspace 办公空间，授权后支持 Gmail、Calendar、Drive、Docs 和 Sheets。 | 1 | Inbox, Calendar, Docs | `model-provider`, `google-workspace`, `shadowob` | connector: `google-workspace` |
| `gsd-buddy` | 规格驱动开发空间，支持上下文、里程碑、计划、执行和验证。 | 1 | Specs, Execution, Review | `model-provider`, `shadowob`, `agent-pack` | pack: `gsd` |
| `gstack-buddy` | 产品团队战略空间，从 GitHub 挂载 gstack 辅助脚本。 | 1 | Office Hours, Weekly Retro | `model-provider`, `shadowob`, `agent-pack` | pack: `gstack` |
| `little-match-girl` | 付费文件 MVP：童话 Buddy 销售火柴，购买后解锁 HTML 火柴动画。 | 1 | match-street | `model-provider`, `shadowob` | commerce |
| `lovart-buddy` | 创意生产空间，接入 Lovart，支持图片、视频、音频、画布、项目和对话工作流。 | 1 | Briefs, Assets, Projects | `model-provider`, `lovart`, `shadowob` | connector: `lovart` |
| `marketingskills-buddy` | 增长团队空间，使用 CRO、文案、SEO、付费、邮件和增长 playbook。 | 1 | General, Briefs | `model-provider`, `shadowob`, `agent-pack` | pack: `marketingskills` |
| `scientific-skills-buddy` | 科研空间，包含数据分析、生物、化学、医学、可视化和写作技能。 | 1 | Research, Analysis, Writing | `model-provider`, `shadowob`, `agent-pack` | pack: `scientific-agent-skills` |
| `seomachine-buddy` | SEO 增长空间，支持关键词研究、内容简报、站内审计和主题权威规划。 | 1 | Keyword Research, Content Briefs, On-page Audits | `model-provider`, `shadowob`, `agent-pack` | pack: `seomachine` |
| `shadow-server-app-demo` | Demo Desk server app、授权 Buddy，以及带 iframe 刷新的 CLI 票据操作演示。 | 1 | Operations | `model-provider`, `shadowob` | 1 server app |
| `slavingia-skills-buddy` | 独立操作者空间，支持写作、决策、设计品味和专注执行。 | 1 | General, Decisions | `model-provider`, `shadowob`, `agent-pack` | pack: `slavingia-skills` |
| `superclaude-buddy` | 结构化开发工作台，包含命令、模式、agents、MCP 指引和信心检查。 | 1 | General, Commands, Architecture | `model-provider`, `shadowob`, `agent-pack` | pack: `superclaude` |
| `superpowers-buddy` | 工程方法空间，支持规格、TDD、实现计划、执行和审查。 | 1 | General, Specs, Review | `model-provider`, `shadowob`, `agent-pack` | pack: `superpowers` |
| `video-workshop` | issue-first AI 视频生产工坊，包含协调、调研、洞察、脚本、渲染、QA、Kanban 跟踪、Buddy Inbox 派发和 Workspace 视频交付。 | 6 | Briefs, Production, QA | `model-provider`, `shadowob`, `skills` | 1 server app, 9 skills |

## 模版结构

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

## Buddy 和 Agent 身份对齐

`shadowob.options.buddies[]` 和 `deployments.agents[]` 表达的是同一个可运行 Buddy 的两面：前者是 Shadow 社区里的身份，后者是 runtime 里的逻辑 Agent 配置。它们必须通过 `bindings[].agentId` 保持一一对应，不能让展示身份和实际职责分叉。

当用户通过“新建云 Buddy”入口部署 Cloud Buddy 时，入口表单里的名称和描述必须写入两处：

- `use[].options.buddies[].name` / `description`，用于 Shadow 资料、频道成员、Inbox、市场列表等可见身份。
- 对应 `deployments.agents[].identity.name` 和 `identity.description` 或 `deployments.agents[].description`，用于 runtime 生成 Agent profile、SOUL/AGENTS 文件和职责提示。

如果生成的 Agent 使用了另一个名字或职责，用户会看到一个 Buddy 名称，但 runtime 实际按照另一个 Agent 的角色工作，Inbox、市场说明、日志和模型指令都会脱钩。单 Buddy 模版应让 Buddy id、binding 的 `agentId`、Agent id、身份名称和职责说明一起生成；多 Agent 模版也必须逐个 Buddy 校验匹配关系。

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

## 密钥和变量

| 写法 | 含义 |
| --- | --- |
| `i18n.title` / `i18n.description` | 多语言模版文案覆盖；`title` / `description` 本身必须是默认真实文本。 |
| `${env:VAR_NAME}` | CLI 部署时使用的本地环境变量。 |
| `${secret:k8s/secret-name/key}` | Kubernetes Secret 引用。 |

不要把原始 API key 写进模版。使用环境变量、平台密钥组、供应商配置或 secret 引用。

## 发布检查

1. 运行 `shadowob-cloud validate --strict`。
2. 确认所有可见文案都有 i18n。
3. 确认每个 Buddy 绑定指向已部署 agent。
4. 确认每个 Buddy 的名称、描述和职责与绑定的 Agent identity 一致。
5. 确认默认频道存在并作为落地目标。
6. 确认密钥是引用，不是明文。
7. 在干净集群部署一次，并给 Buddy 发送测试消息。

强模板不只是聊天窗口。脚本、技能、CLI 命令、MCP 工具、定时任务和审批流程，都可以成为玩法的一部分。
