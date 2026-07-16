# Shadow 随机减熵审查（三）（2026-06-22）

本轮发生在 `dbf9391c chore: remove promo app and embed website auth` 之后。目标不是继续实现新功能，而是随机抽查当前项目里可以删除、收敛或显式下线的复杂度，并记录到 docs，供后续小步处理。

本轮没有改业务代码。

## 结论总览

| 优先级 | 候选点 | 建议方向 |
| --- | --- | --- |
| P1 | Website 仍注入 Google OAuth client id | 删除 Website 侧 OAuth 注入，只保留 Web App 登录面板需要的配置 |
| 暂缓 | Hardening integrations 已进入默认生产 runtime | 先维持现状；更优先补 Space App 标准和 SDK 化量产路径 |
| P1 | Cloud SaaS adapter 对不支持能力返回“空成功” | 删除 shared client 上的伪成功 stub，或改成编译期不可调用/运行期明确 501 |
| P2 | Website `_archive` 页面仍被构建发布 | 删除归档页面，或移出 `website/docs` 构建树 |
| P2 | WarBuddy 默认状态混入 demo-owned 种子坦克 | 把种子数据移到 fixture/dev seed，生产默认状态从空数据开始 |
| P3 | Integration dev scripts 端口和入口漂移 | 删除非标准入口，统一 hot-dev 端口，降低本地调试误触 |

## 1. 删除 Website 侧 Google OAuth 注入

证据：

- `website/rspress.config.ts` 仍读取 `process.env.GOOGLE_CLIENT_ID`。
- 同一文件继续把它定义为 `__SHADOW_GOOGLE_CLIENT_ID__`。
- 当前登录已经改为 Website 弹窗承载 Web App 的 `/app/auth/modal`，Google 登录按钮和 credential 处理都在 `apps/web/src/components/auth/login-panel.tsx`。

建议：

- 删除 `website/rspress.config.ts` 里的 `GOOGLE_CLIENT_ID` 常量和 `__SHADOW_GOOGLE_CLIENT_ID__` define。
- 保留 `__SHADOW_SPACE_APP_BASE_URL__`，因为 Website 仍需要知道 Web App 地址来打开嵌入登录弹窗。
- 不再把 Website 视为 OAuth client id 的消费方，减少构建环境变量和登录逻辑的重复入口。

收益：

- 登录责任只落在 Web App。
- Website 构建不再携带已无用途的 OAuth 配置。
- 后续排查“为什么 Website 登录和 Web 登录行为不同”时少一个分支。

## 2. 暂缓收缩默认生产 runtime，先补 Space App 标准

证据：

- `integrations/README.md` 已说明 `kanban`、`qna` 是当前成熟参考实现，`quiz`、`trainer`、`skills`、`flash`、`space`、`warbuddy` 仍处于 Hardening，尤其需要鉴权、授权、命令 consent 等打磨。
- `integrations/runtime/src/server.ts` 的 combined runtime 仍默认导入并暴露 `kanban`、`qna`、`quiz`、`trainer`、`skills`、`warbuddy`。
- `integrations/runtime/Dockerfile` 也会构建这些 Hardening app。

调整后的建议：

- combined production runtime 暂时维持现状，不在本轮收缩。
- `quiz`、`trainer`、`skills`、`flash`、`space`、`warbuddy` 不是 demo，应继续按生产级项目维护。
- 更迫切的工作是把 Space App 的标准化、SDK 化路径写清楚，覆盖授权、鉴权、用户信息、服务器内协作和快速复制新 App 的工程模板。

收益：

- 避免在标准尚未统一前过早改发布拓扑。
- 让现有 Space Apps 继续作为生产级项目接受打磨，而不是被当成一次性 demo。
- 先把 `kanban`、`qna` 沉淀成可复制的 Space App 规范，再决定 runtime/catalog 如何分层。

## 3. 删除 Cloud SaaS adapter 的伪成功 stub

证据：

- `apps/cloud/src/interfaces/web-saas/api-adapter.ts` 文件头写明 local-only 页面不会进入 SaaS router。
- 同一 adapter 仍保留 local-only 形状：
  - `settings.get` 返回 `{ providers: [] }`。
  - `settings.put` 返回 `{ ok: true }`。
  - `env.getByScope` 返回空 env 列表。
  - `doctor` 返回空检查和全 0 summary。

建议：

- 如果 SaaS 页面已经不会调用这些能力，优先从 SaaS adapter 类型/实现里删除这些方法。
- 如果 shared `CloudApiClient` 暂时要求存在这些字段，至少把写操作改成明确的 unsupported/501，而不是“成功但什么也没做”。
- 中期再拆 `CloudApiClient`：SaaS client 只暴露 SaaS 页面实际使用的能力，本地 dashboard client 保留 local-only 能力。

收益：

- 避免 UI 或未来代码误以为 provider settings 已保存成功。
- 让“不支持”在开发期或运行期更早暴露。
- 减少 SaaS 和本地 dashboard 之间的假交集。

## 4. 删除或移出 Website `_archive`

证据：

- `website/docs/_archive` 下仍有 `buddy`/`buddies` 的中英文 MDX 页面。
- `website/doc_build/_archive/*.html` 已生成，说明这些归档页面仍进入静态产物。

建议：

- 如果这些页面只是历史备份，直接删除。
- 如果还要保留源码参考，移动到 `docs/archive/website/` 一类不参与 Rspress build 的位置。
- 不要把“归档”放在 `website/docs` 目录内，因为它仍是可发布内容树。

收益：

- 减少无意公开旧产品页面的风险。
- 降低 Website 构建产物和搜索索引噪声。
- 删除比继续维护隐藏路由更直接。

## 5. WarBuddy 生产默认状态不要带 demo-owned 种子数据

证据：

- `integrations/warbuddy/src/store.ts` 的 `defaultState()` 会创建 `nova-scout`、`azure-hunter`、`crimson-bastion` 三个初始坦克。
- 这些坦克的 `ownerKind` 是 `'demo'`，owner 显示名是 `WarBuddy Demo Bots`。
- `normalizeTank()` 还会根据 `DEMO_TANK_CODE_BY_ID` 修正 demo tank code。

建议：

- WarBuddy 不是 demo app，但生产默认数据里不应该混入 demo owner。
- 将这组数据移到测试 fixture、开发 seed，或显式 onboarding seed。
- 生产 `defaultState()` 建议从空 `teams`/`tanks` 开始。

收益：

- 避免真实用户环境里出现不可解释的 demo owner。
- 权限和 ownership 逻辑更容易审查。
- 后续排行榜、房间匹配和 replay 数据不需要一直绕过 demo 特例。

## 6. 收敛 integration dev scripts

证据：

- `integrations/qna/package.json` 的 `dev:hot` 默认 Vite 端口是 `5170`。
- `integrations/skills/package.json` 的 `dev:hot` 默认 Vite 端口也是 `5170`。
- `integrations/flash/package.json` 额外有一个 `playground` 入口，其它 integrations 没有同名标准入口。

建议：

- 给每个 Space App 固定唯一默认 hot-dev 端口，避免同时调试时端口抢占。
- 删除或改名非标准 `playground` script；如果只是开发调试入口，放到 README 的临时命令即可。
- 保持 integrations scripts 形状一致：`dev`、`dev:hot`、`compose:dev`、`start`、`typegen`、`typecheck`。

收益：

- 本地开发少踩端口和入口命名坑。
- 新 integrations 更容易复制成熟项目的脚本结构。
- 删除脚本比继续增加说明更不容易漂移。

## 本轮不建议立即动的点

- Admin/Web/Q&A 里仍有 `window.confirm`、`window.alert` 等浏览器原生 modal，用法违反项目规范；这个已经在第二轮审查记录过，本轮不重复展开。
- Cloud template 的 `demo` category 和 demo template 也已在第二轮记录过，本轮不重复作为新发现。
- Message card 旧数据兼容和迁移不再作为约束；当前没有正式上线，后续可以直接删除旧路径。
