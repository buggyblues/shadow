# Cloud Plugin Directory

This directory contains built-in Shadow Cloud plugins. Each plugin is a small, independently enabled connector that can contribute credentials, skills, CLI tools, optional MCP metadata, runtime assets, verification checks, and deployment configuration.

## How To Read A Plugin

Every plugin should keep the operational contract close to the implementation:

- `index.ts` registers the plugin manifest, runtime assets, skills, MCP servers, CLI tools, and verification checks.
- `manifest.json` is used by legacy skill plugins that still load their manifest from JSON.
- `README.md` explains user-facing keys, setup steps, runtime assets, and upstream references.

When adding or changing a plugin, keep the README in sync with the keys declared in `index.ts` or `manifest.json`.

## Connector README Coverage

| Plugin | Main keys | Primary setup docs |
| --- | --- | --- |
| [Agent Browser](./agent-browser/README.md) | `AGENT_BROWSER_PROVIDER`, provider API keys | Agent Browser, Browserbase, Browserless, Browser Use, Kernel |
| [Agent Pack](./agent-pack/README.md) | `GITHUB_TOKEN`, pack repository options | Agent Skills, Claude Code, Codex, MCP |
| [AgentMemory](./agentmemory/README.md) | `AGENTMEMORY_URL`, `AGENTMEMORY_API_KEY`, `AGENTMEMORY_PROJECT_ID` | AgentMemory MCP and CLI |
| [Airtable](./airtable/README.md) | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` | Airtable MCP, PATs, Web API |
| [Alipay](./alipay/README.md) | `ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`, `ALIPAY_PUBLIC_KEY` | Alipay Payment MCP and Open Platform |
| [AMap / Gaode Maps](./amap/README.md) | `AMAP_MAPS_API_KEY` | AMap MCP and Web Service API |
| [Atlassian](./atlassian/README.md) | `ATLASSIAN_API_TOKEN`, `ATLASSIAN_EMAIL`, `ATLASSIAN_SITE_URL` | Rovo Dev, Jira, Confluence |
| [Baidu AppBuilder](./baidu-appbuilder/README.md) | `BAIDU_APPBUILDER_TOKEN`, `BAIDU_APPBUILDER_APP_ID` | Qianfan AppBuilder MCP marketplace |
| [Baidu Maps](./baidu-maps/README.md) | `BAIDU_MAP_API_KEY` | Baidu Maps MCP |
| [Baidu Netdisk](./baidu-netdisk/README.md) | `BAIDU_NETDISK_ACCESS_TOKEN` | Baidu Netdisk MCP |
| [Baidu Smart Program](./baidu-smartprogram/README.md) | `BAIDU_SMARTPROGRAM_APP_KEY`, `BAIDU_SMARTPROGRAM_APP_SECRET` | Baidu Smart Program CLI |
| [Browserbase](./browserbase/README.md) | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | Browserbase MCP |
| [Business Connectors](./business-connectors/README.md) | None | Reserved shared connector directory |
| [Canva](./canva/README.md) | `CANVA_ACCESS_TOKEN`, `CANVA_BRAND_TEMPLATE_ID` | Canva CLI and Connect API |
| [Cloudflare](./cloudflare/README.md) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID` | Cloudflare MCP, Wrangler, skills |
| [Claude Plugin Importer](./claude-plugin/README.md) | `GITHUB_TOKEN`, marketplace/plugin repository options | Claude Code plugins and marketplaces |
| [CNB](./cnb/README.md) | `CNB_TOKEN`, `CNB_ENDPOINT` | CNB MCP on CloudBase |
| [Coze](./coze/README.md) | `COZE_API_TOKEN`, `COZE_SPACE_ID`, `COZE_BOT_ID` | Coze MCP publishing and Open API |
| [DingTalk](./dingtalk/README.md) | `DINGTALK_Client_ID`, `DINGTALK_Client_Secret`, robot fields | DingTalk OpenAPI MCP |
| [Douyin Mini Program](./douyin-miniprogram/README.md) | `DOUYIN_MINIPROGRAM_APP_ID`, `DOUYIN_MINIPROGRAM_PRIVATE_KEY` | Douyin Mini Program CLI |
| [Figma](./figma/README.md) | `FIGMA_ACCESS_TOKEN`, `FIGMA_TEAM_ID` | Figma MCP, Figma REST API, Code Connect |
| [Firebase](./firebase/README.md) | `FIREBASE_TOKEN`, `FIREBASE_PROJECT_ID` | Firebase skills, CLI, MCP |
| [Firecrawl](./firecrawl/README.md) | `FIRECRAWL_API_KEY` | Firecrawl CLI and MCP |
| [FlyAI](./flyai/README.md) | `FLYAI_API_KEY` | FlyAI travel skill and CLI |
| [GitAgent](./gitagent/README.md) | `GITHUB_TOKEN`, repository options | GitAgent standard repositories |
| [Gitee](./gitee/README.md) | `GITEE_ACCESS_TOKEN`, `GITEE_API_BASE` | Gitee MCP |
| [GitHub](./github/README.md) | `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub CLI, MCP, PATs |
| [Google Ads](./google-ads/README.md) | `GOOGLE_PROJECT_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, OAuth or credentials fields | Google Ads MCP |
| [Google Analytics](./google-analytics/README.md) | `GOOGLE_ANALYTICS_PROPERTY_ID`, `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | Google Analytics MCP and GA4 Data API |
| [Google Workspace](./google-workspace/README.md) | `GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON` | Google Workspace CLI auth |
| [Huawei Xiaoyi](./huawei-xiaoyi/README.md) | `HUAWEI_XIAOYI_CLIENT_ID`, `HUAWEI_XIAOYI_CLIENT_SECRET` | Huawei Xiaoyi MCP plugins |
| [HubSpot](./hubspot/README.md) | `HUBSPOT_ACCESS_TOKEN` | HubSpot MCP and private apps |
| [Hugging Face](./huggingface/README.md) | `HF_TOKEN`, `HF_ORG` | Hugging Face agent skills, CLI, MCP |
| [AI Image Generation](./inference-ai-image-generation/README.md) | `INFSH_API_KEY` | inference.sh image skills |
| [Skill Discovery](./skill-discovery/README.md) | None | skills.sh and `skills` CLI |
| [inference.sh](./inference-sh/README.md) | `INFSH_API_KEY` | inference.sh CLI and auth docs |
| [Klaviyo](./klaviyo/README.md) | `KLAVIYO_API_KEY` | Klaviyo MCP |
| [Kuaidi100](./kuaidi100/README.md) | `KUAIDI100_KEY`, `KUAIDI100_CUSTOMER` | Kuaidi100 MCP |
| [Lark / Feishu](./lark/README.md) | `LARKSUITE_CLI_APP_ID`, `LARKSUITE_CLI_APP_SECRET`, `LARKSUITE_CLI_BRAND`, optional Meegle keys | Lark CLI, Meegle CLI, skills |
| [Linear](./linear/README.md) | `LINEAR_API_KEY`, `LINEAR_WORKSPACE_ID`, `LINEAR_TEAM_ID` | Linear MCP and API |
| [Lovart](./lovart/README.md) | `LOVART_ACCESS_KEY`, `LOVART_SECRET_KEY` | Lovart OpenClaw skill |
| [Meta Ads](./meta-ads/README.md) | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | Meta Marketing APIs |
| [Xiaomi MiClaw](./miclaw/README.md) | `MICLAW_ACCESS_TOKEN` | Xiaomi MiClaw ecosystem |
| [Model Provider](./model-provider/README.md) | Auto-detected provider env vars, optional OpenAI-compatible keys | Provider profile and secret detection |
| [Nature Skills](./nature-skills/README.md) | Optional `PUBMED_EMAIL`, `NCBI_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY` | Nature-style academic skills and academic-search MCP |
| [Notion](./notion/README.md) | `NOTION_TOKEN` | Notion MCP and integrations |
| [OceanEngine](./oceanengine/README.md) | `OCEANENGINE_ACCESS_TOKEN`, `OCEANENGINE_ADVERTISER_ID` | OceanEngine MCP |
| [PayPal](./paypal/README.md) | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT` | PayPal MCP and REST apps |
| [Playwright](./playwright/README.md) | None | Playwright CLI and MCP |
| [PostHog](./posthog/README.md) | `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` | PostHog MCP and CLI |
| [Salesforce](./salesforce/README.md) | `SALESFORCE_INSTANCE_URL`, `SALESFORCE_ACCESS_TOKEN`, refresh-token fields | Salesforce CLI and MCP |
| [Sentry](./sentry/README.md) | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry skills, CLI, MCP |
| [SEO Suite](./seo-suite/README.md) | `GOOGLE_SEARCH_CONSOLE_SITE_URL`, GSC credentials, Semrush, Ahrefs | Search Console, Semrush, Ahrefs |
| [Shadow](./shadowob/README.md) | `SHADOW_SERVER_URL`, provisioning token fields | Shadow channel provisioning |
| [Shopify](./shopify/README.md) | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify AI Toolkit and Admin API |
| [Stripe](./stripe/README.md) | `STRIPE_SECRET_KEY` | Stripe CLI, MCP, Agent Toolkit |
| [Supabase](./supabase/README.md) | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | Supabase MCP, skills, CLI |
| [Taobao Open Platform / Alibaba AI PAAS](./taobao-aipaas/README.md) | `TAOBAO_APP_KEY`, `TAOBAO_APP_SECRET`, `TAOBAO_SESSION` | Alibaba AI PAAS MCP services |
| [TAPD](./tapd/README.md) | `TAPD_CLIENT_ID`, `TAPD_CLIENT_SECRET`, `TAPD_WORKSPACE_ID` | TAPD MCP |
| [Tencent Ads](./tencent-ads/README.md) | `TENCENT_ADS_ACCESS_TOKEN`, `TENCENT_ADS_ACCOUNT_ID` | Tencent Ads Marketing API |
| [Tencent Docs](./tencent-docs/README.md) | `TENCENT_DOCS_ACCESS_TOKEN`, optional client credentials | Tencent Docs MCP |
| [Tencent Maps](./tencent-maps/README.md) | `TENCENT_MAPS_KEY` | Tencent Location Service MCP |
| [CAD Skills](./text-to-cad/README.md) | None | text-to-cad CAD, robotics, rendering, and fabrication skills |
| [Vercel](./vercel/README.md) | `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` | Vercel MCP and CLI |
| [Webflow](./webflow/README.md) | `WEBFLOW_TOKEN`, `WEBFLOW_SITE_ID` | Webflow MCP, CLI, skills |
| [WeChat Mini Program Skyline](./wechat-miniprogram-skyline/README.md) | `WECHAT_MINIPROGRAM_APPID`, `WECHAT_MINIPROGRAM_PRIVATE_KEY` | WeChat Skyline skills |
| [WeChat Pay](./wechat-pay/README.md) | `WECHAT_PAY_MCH_ID`, `WECHAT_PAY_API_V3_KEY`, `WECHAT_PAY_PRIVATE_KEY` | WeChat Pay MCP |
| [Wonda](./wonda/README.md) | `WONDA_API_KEY` | Wonda CLI skill |
| [WordPress + WooCommerce](./wordpress-woocommerce/README.md) | WordPress API fields, WooCommerce keys | WP-CLI and WooCommerce REST API |
| [WPS / Kingsoft Docs](./wps/README.md) | `WPS_ACCESS_TOKEN`, optional app credentials | WPS MCP |
| [Yuque](./yuque/README.md) | `YUQUE_PERSONAL_TOKEN` | Yuque MCP and skills |

## Development Checklist

1. Add one plugin per platform or service. Do not combine unrelated services into a single plugin.
2. Prefer official Skills plus official CLI when both exist.
3. Register MCP metadata only when the upstream service documents a stable MCP endpoint or package and the plugin cannot provide the workflow through skills plus CLI alone.
4. Add `PluginAuthField` entries with clear `label`, `description`, `required`, `sensitive`, `placeholder`, and `helpUrl` values.
5. Add verification checks for installed CLI tools and mounted skill files.
6. Document every key and setup path in the plugin README.
7. Update `loader.ts`, plugin tests, and this directory index when a new built-in plugin is added.

## Verification

For connector changes, run:

```bash
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/cloud exec vitest run __tests__/plugins/plugins.test.ts __tests__/infra/runtime-package.test.ts scripts/generate-schema.test.ts
pnpm lint
```
