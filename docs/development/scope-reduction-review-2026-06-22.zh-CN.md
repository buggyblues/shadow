# Shadow 随机减熵审查（2026-06-22）

本次是一次随机抽样式项目审查，不追求覆盖所有模块。审查倾向是：优先调整、合并、归档或删除既有功能面，避免把问题解成“再新增一层”。

## 结论摘要

已按后续决策处理 6 个方向：

1. 移动端语音输入 demo/debug 代码：删除。
2. `apps/playground`：删除，并从 workspace 检查、E2E Docker manifest copy、架构文档中移除。
3. 消息卡片 legacy arrays：直接清理，新写入和读取只走 `metadata.cards[]`，不保留旧数据兼容。
4. `integrations`：不是 demo，而是生产级项目；`kanban`、`qna` 相对成熟，其它项目继续打磨，尤其鉴权、授权、命令 consent 路径。
5. Web DIY Cloud debug mode：删除 URL 参数入口和调试输出 UI。
6. Desktop macOS 中文本地化资源：修复重复别名，保留 `zh` 兜底以及标准 `zh-Hans`、`zh-Hant`。

## 1. 移动端语音输入 demo/debug 应迁出产品源码

**现状证据**

- `VoiceInputDemo` 只有定义，没有被路由或其他组件引用；`getVoiceInputDebugInfo` 也只有定义引用搜索命中。
- `apps/mobile/src/components/chat/voice-input-demo.tsx` 是完整 demo 面板，包含硬编码中英文 UI copy 和 `Alert.alert` 示例，见 `apps/mobile/src/components/chat/voice-input-demo.tsx:20`、`:38`、`:74`、`:85`、`:121`。
- `apps/mobile/src/hooks/use-voice-input-debug.ts` 只暴露 Expo 常量快照，见 `apps/mobile/src/hooks/use-voice-input-debug.ts:3`。
- 产品 hook `useVoiceInput` 会同时调用 mock 与真实 hook 以满足 React hooks 规则，见 `apps/mobile/src/hooks/use-voice-input.ts:60`、`:63`、`:65`、`:71`。

**处理**

- 已删除 `VoiceInputDemo` 和 `use-voice-input-debug.ts`。
- 已移除 `useVoiceInput` 对 mock/real hooks 的重新导出；Expo Go mock 仍作为内部实现保留。

**预期收益**

- 减少 i18n 例外、无引用组件、调试逻辑与真实聊天输入链路的混杂。
- 降低移动端语音功能后续重构时的认知成本。

## 2. `apps/playground` 已删除

**现状证据**

- `apps/playground/README.md` 仍是 Vite 模板说明，见 `apps/playground/README.md:1`。
- package 名称是裸 `playground`，脚本仍有独立 `eslint .`，见 `apps/playground/package.json:2`、`:9`；这与仓库“使用 Biome，不使用 Prettier/独立 lint 体系”的约束不一致。
- 架构文档承认它是 UI playground，`CONTRIBUTING.md` 与 `docs/ARCHITECTURE.md` 都列出该目录；因此它不是简单垃圾目录，而是“身份不清”的 workspace package。
- 现有设计系统文档位于 `docs/design-system/shadow-ui/`，与 `apps/playground` 的职责有重叠。

**处理**

- 已删除 `apps/playground` 源码目录。
- 已从 `Dockerfile.e2e`、`scripts/check-workspace-deps.mjs`、`CONTRIBUTING.md`、`docs/ARCHITECTURE.md` 移除显式引用。
- 已移除根 `.gitignore` 中仅服务 playground 截图工具的规则。

**预期收益**

- 少维护一套前端工具链和示例应用。
- 避免设计系统真实规范、preview HTML、playground app 三处同时漂移。

## 3. 消息卡片字段已收敛到 `metadata.cards[]`

**现状证据**

- 之前存在多套并行卡片字段，容易让商品、付费文件、OAuth link 和 Server App 卡片分叉。
- 项目尚未正式上线相关旧数据，因此不需要保留历史读取 fallback 或迁移计划。

**处理**

- 已把 shared `MessageCard` 扩展为可承载 commerce、paid-file、OAuth link 卡片，并提供按类型读取 helper。
- Web/Mobile 渲染只读 `metadata.cards[]`。
- Web/Mobile 商品发送已改为写 `metadata.cards[]`。
- 服务端 validator、normalization、SDK、Python connector、OpenClaw 和 OAuth message API 都只接受或写入 `metadata.cards[]`。
- 已移除旧 arrays schema、fallback 和双写。

**预期收益**

- 消息协议从“多个并行卡片数组”回到一个扩展点。
- 后续内容 Feed、Server App 卡片、商品卡片不会继续争夺不同字段语义。

## 4. `integrations` 是生产级项目，需要成熟度分层

**现状证据**

- `integrations/README.md` 现已说明这些是 production-grade Server App projects；`kanban` 和 `qna` 是当前相对成熟的参考实现，其它项目需要继续 hardening。
- 本地文档鼓励一次运行所有 standard apps，见 `integrations/README.md:19`。
- 生产 runtime 会把 `kanban/qna/quiz/trainer/skills/warbuddy` 合并到一个 `shadow-integrations` runtime，见 `integrations/README.md:45`。
- `@shadowob/integrations-runtime` 依赖多套 Server App 项目，见 `integrations/runtime/package.json:14` 到 `:19`。
- `pnpm-workspace.yaml` 包含 `integrations/*`，但 `scripts/check-workspace-deps.mjs` 手写白名单没有列入 `integrations/runtime` 和多数 Server App 项目，见 `pnpm-workspace.yaml:4` 与 `scripts/check-workspace-deps.mjs:14`。

**处理**

- 已更新 `integrations/README.md` 和 `docs/api/server-app-integrations.md`，不再把 `integrations` 统称为 demo。
- 已新增成熟度表：`kanban`、`qna` 标为 mature；`quiz`、`trainer`、`skills`、`flash`、`space`、`warbuddy` 标为 hardening。
- 已把 `integrations/kanban`、`qna`、`quiz`、`runtime`、`skills`、`space`、`trainer`、`warbuddy` 加入 `check-workspace-deps` 的 workspace 检查范围。
- 已在 `Dockerfile.e2e` 补齐 `integrations/runtime/package.json` copy。

**预期收益**

- 默认构建、发布和安全审查的范围更小。
- 参考实现和待 hardening 项目的边界更清楚，不再把试验状态隐式变成长期生产承诺。

## 5. Web DIY Cloud debug mode 不应仅由 URL 参数打开

**现状证据**

- `debugMode` 由 `?debug=true` 或路由 search 参数直接开启，见 `apps/web/src/pages/diy-cloud.tsx:474`。
- debug mode 会改变事件过滤：开启后展示完整 generation events，见 `apps/web/src/pages/diy-cloud.tsx:932`。
- debug mode 会显示 step JSON output，见 `apps/web/src/pages/diy-cloud.tsx:1224` 和 `apps/web/src/pages/diy-cloud.tsx:1324`。
- debug mode 会显示工具搜索 trace，见 `apps/web/src/pages/diy-cloud.tsx:1410`。

**处理**

- 已删除 `?debug=true`/route search debug 入口。
- 已删除 step JSON output 和搜索 trace UI。
- 进度事件固定走 `isPublicProgressEvent` 过滤。

**预期收益**

- 降低 AI 生成、模板搜索、部署规划中的内部细节暴露风险。
- Debug 能力仍可保留给开发和管理员，不必作为普通用户功能面维护。

## 6. Desktop macOS 中文本地化资源重复

**现状证据**

- `apps/desktop/assets/zh-Hans.lproj`、`zh-Hant.lproj`、`zh.lproj`、`zh_CN.lproj`、`zh_TW.lproj` 的 `InfoPlist.strings` 内容完全一致，都是 `虾豆`。
- 打包配置把这 5 个中文目录全部硬编码进 extra resources，见 `apps/desktop/forge.config.ts:39` 到 `:47`。
- `CFBundleLocalizations` 也列出所有别名，见 `apps/desktop/forge.config.ts:159`。
- 包校验脚本要求所有别名都存在，见 `apps/desktop/scripts/verify-package-assets.mjs:116`。

**处理**

- 已删除 `zh_CN.lproj`、`zh_TW.lproj` 两份非标准别名资源。
- 保留 `zh.lproj` 作为泛中文兜底，`zh-Hans.lproj`、`zh-Hant.lproj` 作为标准简繁中文资源。
- `forge.config.ts` 和 `verify-package-assets.mjs` 只保留 `en`、`zh`、`zh-Hans`、`zh-Hant`。

**预期收益**

- 减少多份同内容资源的漂移风险。
- 打包资产校验更贴近真实平台需求，而不是验证历史偶然结构。

## 建议执行顺序

1. 对 hardening 状态的 integration 做逐项鉴权/授权/consent review。
2. 后续新增任何卡片类协议都必须扩展 `metadata.cards[]`，不要再添加并行 metadata 数组。

## 本次未做

- 本文件已从初始审查文档更新为执行记录。
- 没有运行全量测试；本次涉及多端和 server 的聚焦验证。
- 没有覆盖所有模块，尤其未深入审查 Cloud 部署、钱包账本、OAuth 授权和媒体权限路径。
