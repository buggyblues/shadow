---
title: Cloud 插件
description: 云官方插件、作用和所需配置。
---

# Cloud 插件

Cloud 插件为模版增加能力。插件可以贡献凭据、技能、脚本、CLI 工具、MCP 元数据、运行时资产、校验检查和部署配置。

在模版里通过 `use` 启用插件：

```json
{
  "use": [
    { "plugin": "model-provider" },
    { "plugin": "shadowob" },
    {
      "plugin": "agent-pack",
      "options": {
        "packs": [
          {
            "url": "https://github.com/example/playbook",
            "ref": "main",
            "autoImport": ["standard", "codex", "mcp", "scripts"]
          }
        ]
      }
    }
  ]
}
```

## 核心插件

| 插件 | 作用 | 常见配置 |
| --- | --- | --- |
| `model-provider` | 根据官方供应商、已保存供应商配置，或用户自有 OpenAI-compatible key 生成 OpenClaw 模型配置。 | 官方供应商选择，或 `OPENAI_COMPATIBLE_API_KEY`、`OPENAI_COMPATIBLE_BASE_URL`、`OPENAI_COMPATIBLE_MODEL_ID` |
| `shadowob` | 创建或挂接虾豆 Space、频道、Buddy、绑定、路由和运行时 token。 | `servers`、`channels`、`buddies`、`bindings`；Pod 内访问的 `SHADOWOB_SERVER_URL` 和编排 token 由平台注入。 |
| `agent-pack` | 从 Git 挂载 skills、slash commands、scripts、setup scripts、MCP 片段、instructions 和 sub-agent 定义。 | `packs[].url`、`packs[].ref`、`packs[].autoImport`，可选 `GITHUB_TOKEN` |

## 官方连接器目录

| 分组 | 插件 | 常见 key |
| --- | --- | --- |
| 浏览器和测试自动化 | `agent-browser`, `browserbase`, `playwright` | `AGENT_BROWSER_PROVIDER`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` |
| 代码和产品协作 | `github`, `gitagent`, `gitee`, `cnb`, `linear`, `atlassian`, `tapd`, `figma` | GitHub/Gitee token、Linear token、Atlassian 站点/邮箱/token、TAPD 凭据、Figma token |
| 文档和工作区 | `google-workspace`, `notion`, `lark`, `tencent-docs`, `wps`, `yuque`, `airtable` | Workspace OAuth JSON、Notion token、Lark app 凭据、文档平台 token |
| 搜索、营销和分析 | `seo-suite`, `google-analytics`, `google-ads`, `meta-ads`, `oceanengine`, `tencent-ads`, `klaviyo`, `posthog`, `firecrawl` | Search Console 站点/凭据、广告平台 token、PostHog key、Firecrawl key |
| 云和部署 | `cloudflare`, `vercel`, `firebase`, `supabase`, `sentry`, `huggingface` | 平台 token、项目 ID、组织 ID、认证 token |
| 商业和支付 | `stripe`, `paypal`, `alipay`, `wechat-pay`, `shopify`, `wordpress-woocommerce` | 供应商 secret、商户号、私钥、店铺域名 |
| 地图、位置和中国平台 | `amap`, `baidu-maps`, `tencent-maps`, `baidu-appbuilder`, `baidu-netdisk`, `baidu-smartprogram`, `douyin-miniprogram`, `wechat-miniprogram-skyline`, `huawei-xiaoyi`, `coze`, `taobao-aipaas`, `dingtalk` | API key、app ID、app secret、access token |
| 媒体和创作 | `canva`, `webflow`, `wonda`, `inference-sh`, `inference-ai-image-generation`, `flyai` | access token、品牌/模版 ID、inference key |

每个插件的精确字段以 `apps/cloud/src/plugins/<plugin>/README.md` 为准。

## 配置如何生效

1. 模版声明需要哪些插件。
2. 部署页展示所需 key 和供应商选择。
3. 用户选择官方供应商或自己的供应商配置。
4. 敏感值保存为加密供应商配置或 secret 引用。
5. 运行时只接收自己需要的作用域配置。

## 安全规则

- 不要把原始 API key 写入 `template.json`。
- 插件 manifest 中的敏感字段必须标记为 sensitive。
- 用户拥有的集成优先使用 OAuth 或供应商配置。
- 官方上游 key 留在虾豆服务端，不注入用户部署。
- 为必要 CLI 工具和挂载的 skill 文件添加校验。

## 开发检查

新增插件时：

1. 一个平台或服务一个插件。
2. 在插件 README 里记录每个 key。
3. 仅在上游 MCP 端点或包稳定时注册 MCP 元数据。
4. 尽量添加 verification checks。
5. 更新插件索引和测试。

运行：

```bash
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/cloud exec vitest run __tests__/plugins/plugins.test.ts __tests__/infra/runtime-package.test.ts scripts/generate-schema.test.ts
```
