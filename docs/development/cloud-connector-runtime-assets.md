# Cloud Connector Runtime Assets

> Goal: let Cloud plugins describe connector capabilities once, then reuse the same model for Skills, CLI binaries, MCP servers, subagents, credentials, and verification.

## Connector Shape

A connector plugin can now emit these runtime asset groups through the plugin API:

| Asset | API | Runtime metadata field | Use case |
|---|---|---|---|
| CLI / binary / package dependency | `api.addRuntimeDependencies()` | `runtimeDependencies` | install `gws`, `gh`, domain CLIs, Python/R tooling, or helper binaries |
| Agent skills | `api.addSkillSources()` | `skillSources` | mount `SKILL.md` bundles from Git repos or future archives |
| Subagents | `api.addSubagentSources()` | `subagentSources` | mount Claude/Codex/OpenClaw subagent definitions without treating them as ad-hoc docs |
| MCP server | `api.addMCP()` | plugin static `mcp` declaration | declare a real stdio/SSE/HTTP/streamable HTTP MCP server when the upstream package actually exposes one |
| Runtime artifact | `api.addRuntimeArtifacts()` | `artifacts` | expose generated indexes such as Shadow slash commands |
| Credential file | `api.addCredentialFiles()` | `credentialFiles` | materialize secret env values as files before the agent starts |
| Verification check | `api.addVerificationChecks()` | `verificationChecks` | certify install/auth/read/write smoke checks with risk labels |

`runtime-extensions.json` is intentionally outside `openclaw.json`. The runner consumes only generic metadata such as credential files and artifacts; plugin-specific install logic stays in plugin-owned K8s providers or shared runtime-asset helpers.

Templates should stay thin. A connector template normally needs only `{ "plugin": "<id>" }`; the plugin owns credential discovery, default service selection, installation, and verification metadata.

`defineConnectorPlugin()` is the standard factory for business connectors. It registers a default same-id skill entry, exposes declared auth fields to the deploy form, emits CLI/MCP/runtime metadata, and keeps OpenClaw config fragments schema-safe.

## Google Workspace Cross-Check

The `google-workspace` plugin is the first connector using the full shape:

- CLI dependency: `@googleworkspace/cli` installs a `gws` binary.
- Skills source: `https://github.com/googleworkspace/cli.git`, `skills/gws-*`.
- Credentials: `GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON` materializes to the `gws` runtime credentials file. Legacy ADC-style values are still tolerated by the runtime mapper, but the deploy form presents the long-running `gws auth export --unmasked` / service-account JSON path as the supported path.
- Verification: `gws --version`, `gws auth status`, `gws drive files list --params '{"pageSize": 1}'`, and `gws calendar +agenda`.

Cross-check result on 2026-05-01:

- `npm view @googleworkspace/cli` reported latest `0.22.5`, with `bin.gws = run.js`.
- `npx -y @googleworkspace/cli --version` returned `gws 0.22.5`.
- `npx -y @googleworkspace/cli --help` listed Drive, Sheets, Gmail, Calendar, Docs, Slides, Chat, Admin Reports, and other services.
- The cloned repository contained 95 `SKILL.md` files under `skills/gws-*`.
- Current `gws` no longer exposes an MCP subcommand. The changelog added `gws mcp` in `0.3.0` but removed it in `0.8.0`, so the Shadow plugin must not declare `gws mcp`.

## Extension Rules

1. Declare only real upstream capabilities. If a package does not expose MCP, do not add a fake MCP server for UI symmetry.
2. Keep installer details in `runtimeDependencies` / `skillSources`; keep auth proof in `credentialFiles` / `verificationChecks`.
3. Use `requiredEnv` when all env vars are needed, and `requiredEnvAny` when any one credential path is enough.
4. Mark verification risk as `safe`, `read`, or `write`; write checks should remain optional and approval-gated.
5. Prefer shared runtime-asset helpers for common Git skill source + CLI install cases, then graduate new repeated patterns into the helper instead of embedding one-off shell in each plugin.

## Business Connectors

The business connector set is intentionally plugin-first, not template-first. Each platform lives in its own `apps/cloud/src/plugins/<id>/index.ts` file and can be enabled independently from any template or deployment config.

Current connector coverage:

- Commerce and payments: `shopify`, `stripe`, `paypal`.
- Ads and analytics: `google-ads`, `meta-ads`, `google-analytics`.
- Design, media, and content systems: `figma`, `canva`, `seo-suite`, `wordpress-woocommerce`, `webflow`.
- Cloud and backend operations: `cloudflare`, `supabase`, `vercel`, `firebase`.
- CRM and lifecycle operations: `hubspot`, `klaviyo`, `salesforce`.
- Project, product, and data operations: `airtable`, `linear`, `atlassian`, `sentry`, `posthog`.
- Browser and web-data operations: `firecrawl`, `playwright`, `browserbase`.
- Skills and agent tooling: `agent-browser`, `skills`, `inference-sh`, `inference-ai-image-generation`, `wonda`, `huggingface`.
- China app-layer services: `lark`, `dingtalk`, `tencent-docs`, `wps`, `yuque`, `alipay`, `wechat-pay`, `amap`, `baidu-maps`, `tencent-maps`, `flyai`, `kuaidi100`, `oceanengine`, `tencent-ads`, `coze`, `taobao-aipaas`, `baidu-appbuilder`, `baidu-netdisk`, `wechat-miniprogram-skyline`, `douyin-miniprogram`, `baidu-smartprogram`, `miclaw`, `huawei-xiaoyi`, `gitee`, `tapd`, and `cnb`.

Capability policy:

- Prefer official CLI plus official skills when available. Shopify mounts Shopify AI Toolkit skills and installs `@shopify/cli`; Webflow mounts Webflow skills and installs `@webflow/webflow-cli`.
- Use remote MCP metadata for providers whose official integration is hosted, such as PayPal, Cloudflare, HubSpot, Klaviyo, Webflow, and Vercel.
- Keep connectors without confirmed official skills as credential/MCP/CLI declarations until the upstream source is verified.

## Global App-Layer Connector Cross-Check

The global connector batch also stays plugin-first. Existing plugins were enhanced in place when a platform was already present.

- Figma: installs the official `@figma/code-connect` CLI and mounts the official skills from `figma/mcp-server-guide`, including implement-design, Code Connect, design-system rules, and file usage workflows.
- Canva: installs the official `@canva/cli`; no stable public skill repo was found, so the plugin exposes a Canva CreativeOps skill entry and keeps API credentials grouped under the connector.
- Airtable: registers the Airtable MCP endpoint and mounts official `Airtable/skills` entries for overview and filter workflows.
- Hugging Face: installs the `hf` CLI through `huggingface_hub[cli]`, registers the Hugging Face MCP package, and mounts official `huggingface/skills` for CLI, datasets, trainers, Gradio, papers, and best practices.
- Linear and Atlassian: register hosted MCP metadata for project-management workflows and expose connector skills for issue, sprint, Jira, and Confluence operations.
- Sentry: installs `@sentry/cli`, registers `@sentry/mcp-server`, and mounts official `getsentry/agent-skills` for issue fixing, PR review, alerts, AI monitoring, and SDK setup.
- PostHog: installs the experimental `posthog-cli` package and registers the hosted PostHog MCP metadata for analytics, flags, errors, logs, and session replay.
- Firebase: installs `firebase-tools` plus `firebase-mcp` and mounts official `firebase/agent-skills` for Auth, Firestore, Hosting, Security Rules, Genkit, AI Logic, and Crashlytics.
- Firecrawl: installs `firecrawl-cli` and `firecrawl-mcp` for crawl, search, scrape, and extraction workflows.
- Playwright: installs `playwright` and `@playwright/mcp` for browser automation, E2E, visual QA, screenshots, and traces.
- Browserbase: installs `@browserbasehq/mcp-server-browserbase` for cloud browser sessions and Stagehand-style workflows.
- Supabase and Cloudflare: keep their existing CLI/MCP plugins and now mount official agent skills from `supabase/agent-skills` and `cloudflare/skills`.

## China Connector Cross-Check

The domestic connector batch follows the same "one service, one plugin" rule.

- Lark / Feishu: installs `@larksuite/cli`, registers `@larksuiteoapi/lark-mcp`, and mounts official `larksuite/cli` skills from `skills/lark-*`.
- DingTalk: registers the verified `dingtalk-mcp` stdio MCP package and preserves the upstream env names `DINGTALK_Client_ID`, `DINGTALK_Client_Secret`, and `ACTIVE_PROFILES`.
- Yuque: registers `yuque-mcp` and mounts the official OpenClaw skills from `yuque/yuque-ecosystem`.
- AMap and Baidu Maps: register the verified npm MCP packages `@amap/amap-maps-mcp-server` and `@baidumap/mcp-server-baidu-map` with their documented env keys.
- FlyAI: installs `@fly-ai/flyai-cli` and mounts `alibaba-flyai/flyai-skill`.
- WeChat Mini Program Skyline: mounts official `wechat-miniprogram/skyline-skills`.
- Gitee: registers `@gitee/mcp-gitee` with the documented `GITEE_ACCESS_TOKEN` / `GITEE_API_BASE` env contract.

Connectors whose official documentation describes an MCP/CLI surface but does not expose a stable package or endpoint in the current cross-check are intentionally registered as credentialed skill connectors first. Once a stable upstream command, URL, or skill repo is verified, the plugin can add `mcp`, `runtimeDependencies`, or `skillSources` without changing templates.

## Skills.sh Connector Cross-Check

The skills.sh connector batch keeps the same independent-plugin shape and focuses on reusable agent capabilities rather than templates.

- Agent Browser: installs the verified `agent-browser` npm CLI and mounts the skill stub from `vercel-labs/agent-browser`, letting the runtime load current browser, Electron, Slack, QA, Vercel Sandbox, and AgentCore instructions from the CLI.
- Skills: installs the verified `skills` npm CLI and mounts only the per-agent configured community skills from `use[].options.install`.
- inference.sh: installs the `belt` CLI through the official `https://cli.inference.sh` installer into the plugin runtime path and mounts `infsh-skills/skills/tools/infsh-cli`.
- AI Image Generation: reuses the same `belt` installer and mounts the image-specific inference.sh skills under `tools/image`, including `ai-image-generation`, `gpt-image`, `flux-image`, `p-image`, image editing, upscaling, and background removal.
- Wonda: installs the verified `@degausai/wonda` npm CLI and mounts `degausai/wonda/skills/wonda-cli` for media generation, editing, research, publishing, credential workflows, and mobile-device automation.
