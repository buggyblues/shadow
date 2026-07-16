# Shadow 与 OpenConnector 的连接器差距

## 对比口径

快照日期：2026-07-11；OpenConnector commit：`6d23b1341475`。

这不是完全等价的数量比较。OpenConnector 的 provider 主要暴露标准化 Actions；Shadow 的
插件需要给 Buddy 提供 CLI、Skill、MCP、依赖和部署声明。前者的 provider 数量不能直接视为
Shadow 可生产部署的插件数量，但适合用于发现目录和 OAuth 覆盖缺口。

| 指标 | 数量 |
| --- | ---: |
| OpenConnector `src/providers` 目录 | 1,045 |
| OpenConnector 声明 OAuth2 的 provider | 62 |
| Shadow 生成插件目录 | 72 |
| Shadow 用户可见连接器（排除内部插件） | 70 |
| 双方标准化 ID 精确重合 | 22 |
| Shadow 首批可用 OAuth manifest | 12 |

双方精确重合的 22 个 ID 是：Airtable、Amap、Browserbase、Canva、Figma、Firecrawl、
GitHub、Google Analytics、HubSpot、Hugging Face、Klaviyo、Linear、Notion、PostHog、
Sentry、Shopify、Stripe、Supabase、Tencent Docs、Tencent Maps、Vercel、Webflow。

按标准化 ID 机械计算，OpenConnector 有 1,023 个目录未在 Shadow 出现。这个数字包含同义项、
聚合项和只适合 Actions 的长尾 API，不能作为直接开发清单。例如 Shadow 用一个
`google-workspace` 聚合插件，而 OpenConnector 将 Calendar、Drive、Docs、Sheets 等拆开。

## 优先补齐的连接器

优先级同时考虑 OAuth 需求、Buddy 使用频率和能否提供明确的运行时工具，不按 1,023 个目录
逐个复制。

### P0：协作、文件与账号连接

- Google：Gmail、Calendar、Drive、Docs、Sheets、Slides；先重构现有 Google Workspace
  凭证模型，再决定保持聚合插件还是拆分子能力。
- Microsoft 365：Outlook、OneDrive、Excel。
- 团队协作：Slack、Discord、Zoom。
- 文件：Dropbox。

### P1：研发、项目与支持

- 研发运维：GitLab、Netlify、Datadog、PagerDuty、Grafana。
- 项目协作：Jira、Confluence、ClickUp、Monday、Asana、Trello。
- 客服：Zendesk、Intercom、Freshdesk、Freshservice。

### P2：增长、内容与商业

- 内容与社交：YouTube、LinkedIn、Twitter、Spotify、Typeform。
- 营销与日程：Mailchimp、Todoist、Calendly。
- 商业：WooCommerce、Square。

## Shadow 已有而不应因对标被削弱的部分

Shadow 已覆盖一批面向中文互联网和 Buddy 部署的插件，例如 Lark、DingTalk、Gitee、Alipay、
WeChat Pay、Tencent Ads、Tencent Docs、Tencent Maps、WPS、Yuque、Coze 和多种小程序平台。
这些插件在 OpenConnector 中没有完全对应的标准化 ID，是 Shadow 的差异化覆盖，不应为了目录
对齐改成 OpenConnector 的 provider 模型。

## 落地原则

1. 新连接器仍进入 `apps/cloud/src/plugins`，manifest 是认证和能力的唯一事实来源。
2. OAuth 只是 manifest 的一种连接方式，复用现有用户账号记录、云电脑绑定和部署覆盖层。
3. 每个新插件至少提供 Buddy 可调用的 CLI、Skill 或 MCP 之一；只有 API Actions 清单不算完成。
4. 优先将 OpenConnector 的端点、scope、PKCE 和 token refresh 元数据作为审查参考，不依赖其
   runtime，也不在产品中暴露另一套 provider 概念。
5. 每一批先做 5–10 个高频连接器，验证授权、刷新、断开、重新部署和 Web/Mobile 一致性后再扩展。
