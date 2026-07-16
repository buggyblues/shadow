---
title: Cloud Plugins
description: Official Cloud plugins, what they do, and which keys they require.
---

# Cloud Plugins

Cloud plugins add capabilities to a template. A plugin can contribute credentials, skills, scripts, CLI tools, MCP metadata, runtime assets, verification checks, and deployment configuration.

Enable plugins in a template with `use`:

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

## Core Plugins

| Plugin | What it does | Common configuration |
| --- | --- | --- |
| `model-provider` | Builds OpenClaw model configuration from the official provider, saved provider profiles, or user-owned OpenAI-compatible keys. | Official provider selection or `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_MODEL_ID` |
| `shadowob` | Creates or attaches Shadow Spaces, channels, Buddies, bindings, routes, and runtime tokens. | `servers`, `channels`, `buddies`, `bindings`; pod-facing `SHADOWOB_SERVER_URL` and provisioning token are injected by the platform. |
| `agent-pack` | Mounts skills, slash commands, scripts, setup scripts, MCP fragments, instructions, and sub-agent definitions from Git. | `packs[].url`, `packs[].ref`, `packs[].autoImport`, optional `GITHUB_TOKEN` |

## Official Connector Catalog

| Group | Plugins | Typical keys |
| --- | --- | --- |
| Browser and test automation | `agent-browser`, `browserbase`, `playwright` | `AGENT_BROWSER_PROVIDER`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` |
| Code and product work | `github`, `gitagent`, `gitee`, `cnb`, `linear`, `atlassian`, `tapd`, `figma` | GitHub/Gitee tokens, Linear token, Atlassian site/email/token, TAPD credentials, Figma token |
| Documents and workspace | `google-workspace`, `notion`, `lark`, `tencent-docs`, `wps`, `yuque`, `airtable` | Workspace OAuth JSON, Notion token, Lark app credentials, document platform tokens |
| Search, marketing, and analytics | `seo-suite`, `google-analytics`, `google-ads`, `meta-ads`, `oceanengine`, `tencent-ads`, `klaviyo`, `posthog`, `firecrawl` | Search Console site/credentials, ad platform tokens, PostHog keys, Firecrawl key |
| Cloud and deployment | `cloudflare`, `vercel`, `firebase`, `supabase`, `sentry`, `huggingface` | Platform tokens, project IDs, org IDs, auth tokens |
| Commerce and payment | `stripe`, `paypal`, `alipay`, `wechat-pay`, `shopify`, `wordpress-woocommerce` | Provider secret keys, merchant IDs, private keys, store domains |
| Maps, location, and China platforms | `amap`, `baidu-maps`, `tencent-maps`, `baidu-appbuilder`, `baidu-netdisk`, `baidu-smartprogram`, `douyin-miniprogram`, `wechat-miniprogram-skyline`, `huawei-xiaoyi`, `coze`, `taobao-aipaas`, `dingtalk` | Provider API keys, app IDs, app secrets, access tokens |
| Media and creation | `canva`, `webflow`, `wonda`, `inference-sh`, `inference-ai-image-generation`, `flyai` | Access tokens, brand/template IDs, inference keys |

Every plugin README under `apps/cloud/src/plugins/<plugin>/README.md` is the source of truth for exact fields.

## How Configuration Works

1. The template declares which plugins it needs.
2. The deploy page shows required keys and provider choices.
3. Users choose the official provider or their own provider profile.
4. Sensitive values are stored as encrypted provider profiles or secret references.
5. The runtime receives only the scoped configuration it needs.

## Security Rules

- Do not write raw API keys into `template.json`.
- Mark sensitive fields as sensitive in plugin manifests.
- Prefer OAuth or provider profiles when a user owns the integration.
- Keep official upstream keys on Shadow Spaces; never inject them into user deployments.
- Add verification checks for required CLI tools and mounted skill files.

## Development Checklist

When adding a plugin:

1. Add one plugin per platform or service.
2. Document every key in the plugin README.
3. Register MCP metadata only when the upstream MCP endpoint or package is stable.
4. Add verification checks where possible.
5. Update the plugin index and tests.

Run:

```bash
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/cloud exec vitest run __tests__/plugins/plugins.test.ts __tests__/infra/runtime-package.test.ts scripts/generate-schema.test.ts
```
