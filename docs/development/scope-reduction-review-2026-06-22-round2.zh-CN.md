# Shadow 随机减熵审查（二）（2026-06-22）

本轮在上一批删除和协议收敛提交之后继续抽样，并按后续决策删除 `apps/promo`、改造 Website 登录边界。审查取向仍然是：优先删除、合并、降级或改为更窄的维护面，而不是新增一层。

## 结论摘要

建议后续优先评估 6 个方向：

1. Admin 前端存在“大 dashboard + tabs + 未路由页面”的重复管理面，应收敛为单一管理入口，并删除未使用页面。
2. Web/Admin/Integrations 仍有浏览器原生 `confirm`/`alert`，应删除原生弹窗路径，统一使用产品内确认与提示组件。
3. Q&A integration 被定位为成熟项目，但仍有硬编码中文和 `window.confirm`，应作为 mature 前置清理项。
4. Cloud 演示模板已迁移为 `shadow-space-app-demo` reference/starter，不再暴露旧机制名称。
5. Website 原先承担登录和 token 存储，和 Web App auth 边界重叠；已改为 Website 弹窗承载 Web App 嵌入式登录面，Website 不直接处理 token。
6. `apps/promo` 是偶发素材生成工具，却作为 workSpace App 进入常规依赖图；已按后续决策删除。

## 1. Admin 管理面重复，适合合并或删除旧入口

**改造前证据**

- `apps/admin/src/main.tsx` 只挂载 `/` 的 `DashboardPage`，并把其它路径重定向到根路径；注释写着 `/config` 和 `/templates` 已经并入 dashboard。
- `apps/admin/src/pages/dashboard.tsx` 有 3389 行，仍内嵌用户、服务器、Buddy、模板等多块管理逻辑。
- 同目录下同时存在拆分后的 `tabs/TemplatesTab.tsx`、`tabs/UsersTab.tsx`、`tabs/ServersTab.tsx`、`tabs/SpaceAppsTab.tsx` 等 tab 组件。
- `pages/template-review.tsx`、`pages/config-management.tsx`、`pages/config-editor.tsx`、`pages/config-schema-manager.tsx`、`pages/feature-flags.tsx` 仍保留源码，但从当前 router 看不到直达路由。

**建议**

- 选一个方向：要么保留 `DashboardPage` 并删除未路由页面与重复 tabs；要么把 dashboard 拆成 tab/page 入口，再删除 dashboard 内重复实现。
- 优先删“没有路由、没有外部入口、只和 dashboard 重叠”的页面文件。
- 对模板管理只保留一个实现，避免 `dashboard.tsx` 和 `TemplatesTab.tsx` 双写字段、placeholder、错误处理。

**收益**

- Admin 是高权限面，重复 UI 会放大安全审查和回归测试成本。
- 删除未路由页面比继续维护多套管理入口更安全。

## 2. 原生浏览器弹窗仍在产品路径中

**现状证据**

- Web 已有 `apps/web/src/components/common/confirm-dialog.tsx`，大量页面已经通过 `useConfirmStore` 使用产品内确认框。
- 同一文件在 Vitest 分支仍调用 `window.confirm`。
- Web 仍有直接 `window.confirm`：`marketplace-detail.tsx`、`buddy-management.tsx`、`settings/wallet.tsx`。
- Admin 已有 `apps/admin/src/components/confirm-dialog.tsx` 和 `ConfirmDialogProvider`，但 `dashboard.tsx`、`TemplatesTab.tsx`、`ServersTab.tsx`、`UsersTab.tsx`、`SpaceAppsTab.tsx` 仍直接 `confirm`/`alert`。

**建议**

- 删除 `ConfirmStore` 的 `window.confirm` 测试 fallback，测试应 mock store 行为，而不是保留浏览器弹窗分支。
- Web 直接 `window.confirm` 的几个页面改用现有 `useConfirmStore`。
- Admin 先决定第 1 条里的管理面收敛，再把保留下来的入口统一接 `showConfirm` 和站内 toast/error panel；被删除的旧页面不用迁移。

**收益**

- 符合仓库“不要使用 browser modal APIs”的约束。
- 减少测试环境里 `window.confirm` 行为分叉，也减少用户体验不一致。

## 3. Q&A integration 的成熟度需要和实现细节对齐

**现状证据**

- `integrations/README.md` 已把 `qna` 标为 Mature。
- `integrations/qna/src/client/main.tsx` 仍有三处 `window.confirm`，分别用于删除问题和删除答案。
- 同一处 UI copy 直接写中文：`删除这个问题？`、`删除问题`、`删除这个答案？`、`删除答案`。

**建议**

- 把 Q&A 的删除确认改为 app 内 modal/confirm 组件，并接入 integration 自己的文案体系。
- 如果短期不准备补齐确认和 i18n，建议把 Q&A 从 Mature 降到 Hardening，或者临时隐藏 destructive action。

**收益**

- Mature integration 的标准应高于普通示例，尤其是删除类操作。
- 可以把 integrations 的成熟度表变成真实发布门槛，而不是描述性文档。

## 4. Cloud 模板里的 `demo` 口径应继续收敛

**现状证据**

- `apps/cloud/src/services/template-i18n.service.ts` 中 `managed-agents-demo` 仍归类为 `demo`，文案写明用于 demos/onboarding。
- `apps/cloud/templates/shadow-space-app-demo.template.json` 是统一 Space App 机制的参考模板。
- 生成文档 `website/docs/en/platform/cloud-templates.md` 和中文版本只公开列出 `shadow-space-app-demo`。
- `apps/cloud/src/interfaces/web-saas/api-adapter.ts`、`apps/cloud/packages/ui/src/lib/api.ts`、`apps/web/src/components/discover/cloud-template-card.tsx` 的 `TemplateCategoryId` 都包含 `demo`，fallback 也是 `demo`。

**建议**

- 如果这些模板是生产可用 reference，统一改名为 `starter` 或 `reference`，并改掉 slug/title/searchText 中的 demo 语义。
- 如果只是演示模板，从公开模板目录和网站 docs 中移除，保留到内部 fixtures 或测试资产。
- Category fallback 不应是 `demo`，更适合作为 `business`、`education` 或明确的 `starter`。

**收益**

- 和上一轮对 `integrations` 的生产级定位保持一致。
- 避免用户在正式 Cloud 模板目录里看到“demo 即默认分类”的信号。

## 5. Website 登录应保留弹窗体验，但收回认证边界

**现状证据**

- `website/components/LoginModal.tsx` 复用 `@shadowob/views/login`，登录成功后直接写 `accessToken` 和 `refreshToken` 到 website 的 `localStorage`。
- `website/lib/shadow-api.ts` 读取 website `localStorage.accessToken` 发 API 请求。
- `website/theme/index.tsx` 和 `website/components/HomeContent.tsx` 都有 `hasStoredAuthSession()`，并通过 `shadow:website-login` 打开 Website 登录弹窗。
- Web App 已有完整 auth/session/refresh/desktop sync 链路，路径集中在 `apps/web/src/lib/auth-session.ts`、`apps/web/src/stores/auth.store.ts` 和 `/app/oauth-callback`。

**处理**

- Web App 新增 `/app/auth/modal?redirect=...&origin=...&lang=...`，复用 `LoginPanel`、`LoginView` 和 `applyAuthenticatedSession`。
- `LoginPanel` 新增 `completionMode="notify"` 和 `oauthRedirect` 覆盖点；普通 `/app/login` 保持成功后导航，嵌入式登录完成后只通知父页面。
- OAuth 登录在嵌入式场景会先回到 `/app/auth/modal`，由内嵌页检查 Web App session 后通过 `postMessage` 发 `shadow.auth.completed`。
- Website 的 `LoginModal` 已删除登录请求、Google client id 配置、token localStorage 写入逻辑，改为 iframe host。
- Website 只负责打开弹窗、校验 `postMessage.origin`、关闭弹窗并跳转到目标 App URL。

**收益**

- 减少一处 token 存储和 session 刷新边界。
- 用户仍看到原地弹窗登录，不需要跳转到独立登录页。
- Website 构建、文档站和营销页会更容易缓存、部署和安全审查。

**后续**

- Website 的 invite-code gate 仍会读取同源 `localStorage.accessToken` 进行站内 API 请求；如果后续也要完全收回这条边界，应迁到 Web App 内部的受控流程。
- 生产部署需要确认 Web App 的 CSP/frame-ancestors 允许官网域名嵌入 `/app/auth/modal`，但不要允许任意第三方域名。

## 6. `apps/promo` 已删除

**删除前证据**

- `apps/promo` 是 Remotion promotional media source，根 `package.json` 有 `promo:*` 脚本。
- `Dockerfile.e2e` 仍 copy `apps/promo/package.json`，因此常规 workspace install/e2e build context 会纳入 Remotion 依赖。
- 代码用途集中在素材生成：`apps/promo/README.md` 写明输出到 `apps/promo/out/`，并通过 `sync-assets` 从 Web/Website 复制素材。

**处理**

- 已删除 `apps/promo`。
- 已移除根 `promo:*` 脚本、`Dockerfile.e2e` manifest copy，以及 README/CONTRIBUTING/架构/开发文档中的引用。

**收益**

- 缩小默认依赖图和 Docker layer 变动面。
- 把“生产应用”和“偶发素材生成工具”边界分清。

## 建议执行顺序

1. 先处理浏览器原生弹窗：Web 直接调用点少，风险低；Q&A 是成熟度门槛，收益明显。
2. 再做 Admin 管理面裁剪，先列出实际路由和可删除页面，再删除重复入口。
3. Cloud 模板 `demo` 口径需要产品命名决策，适合和模板目录一起批量处理。
4. Website invite-code gate 仍有边界重叠，建议等登录改造稳定后再继续收回。

## 本轮未做

- 没有迁移 Website invite-code gate；本轮只收回登录和 token 写入边界。
- 没有证明 Admin 未路由页面完全无用，仍需在删除前确认是否有人手工使用。
- 没有处理 Admin/Q&A/Web 的原生浏览器弹窗调用点。
