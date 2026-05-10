# OpenClaw Shadow 插件重构与加固

> 目标：把 `@shadowob/openclaw-shadowob` 从“能跑的桥接脚本”打磨成可长期维护、可诊断、可冒烟验证的 OpenClaw Channel Plugin。插件必须稳定承接 Cloud SaaS 部署出的 Buddy，在 Shadow 服务器、频道、私聊和多账号场景中自然地收发消息、附件、表单和定时任务。

## 背景

Shadow Cloud 会把 agent pack、模型配置、密钥、频道策略和 Buddy 身份组装成 OpenClaw 运行时。`openclaw-shadowob` 是运行时与 Shadow Server 之间的唯一通道插件，所以它不能把业务逻辑散落在容器 entrypoint 或 Cloud handler 里，也不能依赖手写特例来补齐上游包能力。

当前插件已经支持基础频道连接、消息监听、策略判断、slash command 注册和互动组件，但代码集中在少量超大文件中，导致以下风险：

- 职责混杂：连接生命周期、消息策略、上下文组装、附件下载、表单回执、slash command、心跳和 OpenClaw reply pipeline 交织在同一文件里。
- 故障难定位：LLM 已生成回复但消息未投递、定时任务执行后没有发到 Shadow、附件上传失败时缺少清晰边界和可测降级路径。
- 扩展成本高：多 Buddy、多账号、多 agent 映射和更多 agent pack 导入时，需要稳定的小模块，而不是继续向通用镜像或单个插件文件追加补丁。

## 架构原则

- 插件拥有 Shadow 通道职责：账号解析、会话路由、WebSocket/REST 投递、频道策略、附件和互动组件都应在插件内完成。
- OpenClaw Core 拥有通用职责：LLM reply pipeline、session store、heartbeat/cron 调度、共享 message tool 和插件注册由 OpenClaw 管理，Shadow 插件只提供对应 adapter。
- Cloud 和容器镜像只做装配：不得在通用 runner entrypoint 中写死 Shadow 或 agent-pack 的行为补丁；agent pack/slash command/交互能力通过插件接口注入。
- 小接口优先：保持 PluginAPI + Manifest 模式，优先拆清楚 adapter 与 runtime helper，而不是引入新的大框架。
- 可诊断优先：每条关键链路都要有明确日志、错误上报和最小测试，避免“生成了但没发出”的静默失败。

## 预期功能

1. 收发消息：频道、线程和私聊消息能进入 OpenClaw inbound pipeline，LLM 的 tool/block/final 回复都能可靠投递到 Shadow。
2. 心跳：Buddy 账号定期向 Shadow Server 上报在线状态，断连后能恢复；OpenClaw heartbeat/cron 的回复能按 last 或显式 target 投递。
3. 收发附件：用户附件能下载到 OpenClaw 工作目录并注入上下文；Agent 产出的本地文件、file URL、HTTP URL 和 base64 buffer 能上传到 Shadow 消息。
4. 定时任务：cron/heartbeat 触发后使用正确 session 和 Shadow target，不因为缺少最近会话绑定或 target 解析而丢消息。
5. 聊天规则：listen、reply、mentionOnly、replyToUsers、keywords、smartReply、replyToBuddy 和 buddy 链路防循环规则稳定生效。
6. 多 Buddy 互相讨论：同一频道内多个 Buddy 可以按策略接力讨论，链路深度、黑白名单和自我回环保护可控。
7. 收发表单：slash command 和 message tool 可以发送 buttons/select/form/approval，提交后服务器保存状态，插件能读取回执并带着 source prompt、responsePrompt 和字段值继续执行。
8. 多 Buddy 账户连接：一个 OpenClaw 配置可连接多个 Shadow bot 账号，每个账号映射不同 OpenClaw Agent，并独立维护连接、心跳、日志和会话。

## 重构范围

### Channel Plugin

- `channel.ts` 保留为轻量 facade，只导出组装完成的 `shadowPlugin`。
- 将 metadata、config adapter、schema helper、interactive block normalizer、actions、status、gateway、prompt hints、messaging adapter 拆成独立模块。
- `actions` 只处理 Shadow action contract，不直接承载插件启动或监控逻辑。

### Monitor Runtime

- `monitor.ts` 保留为兼容入口，实际逻辑迁移到 `src/monitor/*`。
- 拆分为 slash commands、interactive response、message policy、media inbound、reply delivery、watermarks/session cache、typing、DM/channel processor 和 provider lifecycle。
- provider lifecycle 负责连接、频道加入、catch-up、心跳和 stop；message processor 只负责单条消息到 OpenClaw ctx 的转换与 dispatch。

### Outbound Delivery

- 统一 channel/thread/DM target 解析与投递。
- 回复投递必须使用 OpenClaw 的 typed reply pipeline，包含 typing callbacks、错误回调和 final flush 语义。
- 附件发送支持本地路径、file URL、HTTP URL、base64 buffer 和多 media URL，并在失败时返回可诊断错误。

## 冒烟测试口径

每条功能至少要有一个最小可执行验证：

- 插件单元测试：target 解析、slash command 规范化、策略判断、interactive context、附件路径处理、reply dispatch helper。
- 容器冒烟测试：启动 Shadow Server、OpenClaw、`openclaw-shadowob` 插件和至少一个 Buddy 账号。脚本会从 `.env` 注入 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 到 OpenClaw `models.providers`，避免 runner 默认回退到官方 OpenAI。
- 基础冒烟测试：`pnpm smoke:openclaw-shadowob:basic` 或 `pnpm smoke:openclaw-shadowob -- --suite basic`，覆盖 `/ready`、远端配置、心跳、slash command 注册和频道消息往返。默认 `pnpm smoke:openclaw-shadowob` 只跑 basic，保持反馈快。
- 进阶冒烟测试：`pnpm smoke:openclaw-shadowob:advanced` 覆盖附件下载/上下文注入、表单发送、服务端 interactive state、重复提交幂等和表单回执后续回复。
- direct channel 冒烟测试：`pnpm smoke:openclaw-shadowob:dm` 覆盖 `shadowob:channel:<id>` 私聊创建、REST 发送、`channel:message:new` relay、OpenClaw inbound pipeline 和 Buddy 私聊回复。
- 规则冒烟测试：`pnpm smoke:openclaw-shadowob:rules` 覆盖 `mentionOnly` 策略的拦截和显式 `@buddy` 放行。
- 多账号/多 Buddy 冒烟测试：`pnpm smoke:openclaw-shadowob:multi` 创建第二个 Buddy token，映射到第二个 OpenClaw agent，验证两个账号独立心跳，并在同一频道收到同一条人类消息后分别回复。
- 定时任务冒烟测试：`pnpm smoke:openclaw-shadowob:cron` 使用 OpenClaw cron 创建一次性 isolated job，并显式设置 `--announce --channel shadowob --to shadowob:channel:<id>`，确认 Shadow 频道实际收到投递，而不是只在 OpenClaw 日志里完成。
- 线程冒烟测试：`pnpm smoke:openclaw-shadowob:thread` 在隔离频道内创建 thread，验证用户 thread 消息进入 OpenClaw，Buddy 回复保留 `threadId`，并能从 `/api/threads/:id/messages` 读回。
- direct channel 附件冒烟测试：`pnpm smoke:openclaw-shadowob:dm-advanced` 覆盖用户私聊附件上传、direct channel message relay、附件上下文注入、Buddy 回复和 `replyToId`。
- Agent 出站附件冒烟测试：`pnpm smoke:openclaw-shadowob:media-outbound` 直接调用插件 `sendAttachment` action，分别验证频道和 direct channel 的 message-first/upload-afterward 附件投递。
- 交互动作冒烟测试：`pnpm smoke:openclaw-shadowob:interactive` 直接调用插件 approval action，验证 90 天路线图与 MVP 范围随表单发送、服务端 submission 状态持久化、提交后控件锁定，以及 Buddy 基于提交结果继续回复。
- 多 Buddy 讨论链路冒烟测试：`pnpm smoke:openclaw-shadowob:discussion` 使用两个隔离 Buddy，并注入 `Product Strategist` 与 `Risk Reviewer` 两种人设。测试会验证真实讨论内容包含方案、MVP、风险、取舍、建议，验证 `replyToBuddy`、`maxBuddyChainDepth` 和 `agentChain.depth` 防循环元数据，并等待一个窗口确认没有第三跳继续触发。
- 并发深度冒烟测试：`pnpm smoke:openclaw-shadowob:parallel -- --suite deep --concurrency=2` 会并行拆跑 `thread,dm-advanced,media-outbound,interactive,discussion`。每个 suite 使用独立容器、独立配置目录、独立频道和 Buddy 账号，避免多个 Buddy 互相干扰；默认复用已构建 runner 镜像与镜像内 runtime dependency cache，几分钟内聚合定位失败点。
- 镜像构建一致性：`--build` 会先构建 `@shadowob/shared`、`@shadowob/sdk` 和 `@shadowob/openclaw-shadowob`，Dockerfile 再把这三个本地包 overlay 到 runner 镜像。这样可以保留 OpenClaw/npm 依赖缓存，同时避免插件新代码解析到旧版 SDK。
- 完整冒烟测试：`pnpm smoke:openclaw-shadowob:all` 等价于 `basic,advanced,dm,rules,multi,cron,thread,dm-advanced,media-outbound,interactive,discussion`。日常定位优先跑拆分套件或并发深度套件，避免一次性长跑遮蔽根因。

## P0 加固落点

- 消息处理链路拆为 `preflight`、`media`、`reply-delivery`、`thread-bindings`：单条消息进入后先执行聊天规则和 buddy 防循环，再下载附件、组装上下文、记录 session/thread 绑定，最后交给 OpenClaw typed reply pipeline。
- 交互组件状态由 Shadow Server 持久化：`POST /api/messages/:id/interactive` 创建唯一 submission，`GET /api/messages/:id/interactive-state?blockId=<blockId>` 为 Web/Mobile 渲染提供服务端状态，表单提交后控件按服务端结果锁定。
- outbound adapter 只暴露当前 OpenClaw API 的 `sendText`/`sendMedia`，移除旧的 `attachedResults`/`base` 兼容形态，target 前缀只接受 `shadowob` 和 `openclaw-shadowob`。
- 附件投递失败不再中断整条回复：上传失败时会记录错误，并向同一频道/线程/DM 发送 URL fallback，保证用户能看到 LLM 已产生的结果。

## 完成标准

- `pnpm --filter @shadowob/openclaw-shadowob test`、`typecheck` 通过。
- 插件大文件显著拆分，单个新模块职责清晰；兼容入口不破坏现有 import。
- 不向通用 runner image 或 Cloud handler 增加 Shadow 特例。
- 关键失败路径有明确日志，能够区分：OpenClaw 未生成、reply pipeline 未 flush、Shadow REST/WebSocket 投递失败、频道策略拦截、账号未配置或服务器不可达。
- 在缺少 LLM Key 时，测试应明确标记为跳过或使用 mock；存在 `.env` Key 时，容器冒烟测试可以直接跑通。

## Discord 能力对齐路线图

> 目标：以 OpenClaw 官方 Discord Channel Plugin 为参照，把 ShadowOB 从“可聊天的适配器”提升为 OpenClaw 的一等频道。这里记录能力差距、优先级和验收口径，后续按阶段推进，避免继续靠单点补丁修复体验问题。

### 当前 ShadowOB 能力基线

ShadowOB 目前已经覆盖以下核心链路：

- 基础会话类型：频道、线程、私聊。
- 出站消息：文本、回复、附件上传，支持 `send` 和 `upload-file`。
- 消息操作：`react`、`edit`、`delete`。
- 入站处理：频道消息、DM 消息、附件上下文、slash command、交互回执。
- 运行状态：账号心跳、WebSocket 监听、基础 typing/activity。
- 交互组件：通过 Shadow message metadata 支持 buttons、forms、approval，并能把提交结果回流给 Agent。
- 部署验证：已有 basic、DM、thread、interactive、media-outbound、discussion 等 smoke suite。

这些能力说明 ShadowOB 已经能支撑 Buddy 在频道内工作，但和 Discord 插件相比，还缺少 OpenClaw runtime 层面的目录、诊断、会话绑定和完整 message tool action 面。

### 能力差距矩阵

| 能力域 | Discord 插件能力 | ShadowOB 当前状态 | 优先级 |
|--------|------------------|-------------------|--------|
| Message tool action | `send`、`read`、`search`、`react`、`reactions`、`edit`、`delete`、`pin`、`unpin`、`list-pins`、`thread-create`、`thread-list`、`thread-reply`、`poll`、`sticker` 等 | 只有 `send`、`upload-file`、`react`、`edit`、`delete` | P0/P1 |
| Target resolver | 支持 `channel:<id>`、`user:<id>`、目录解析、当前频道 fallback | 主要依赖 `shadowob:channel:<uuid>`、`shadowob:channel:<uuid>` | P0 |
| Directory adapter | 能列出 peer/group，并支持 live/config 两套目录来源 | 缺少 OpenClaw directory adapter | P0 |
| Conversation bindings | 支持当前会话绑定、线程子会话、idle/max-age lifecycle、跨上下文展示 | 有自定义 thread binding 文件，但未完整对齐 OpenClaw contract | P0 |
| Interactive/presentation | 支持 OpenClaw presentation components、buttons、selects、modals、组件 TTL 和提交路由 | 支持 Shadow metadata buttons/forms，但尚未统一到 OpenClaw presentation/interactive 模型 | P0 |
| Media pipeline | 支持多附件、media sequence、local roots/readFile、组件+媒体混发、voice audio | 支持基本上传和 URL fallback，多附件/本地读取/诊断还不完整 | P1 |
| Status/doctor/audit | 支持账号 probe、权限 audit、intents 诊断、status issues | 只有基础 `getMe` probe 和连接状态 | P1 |
| Setup/pairing | 支持 pairing、allowlist 名称解析、配置向导 | 主要依赖 Shadow Cloud 写配置 | P1 |
| Permission/security | 对 moderation 等特权 action 做 sender 校验，支持细粒度 action gate | 依赖 Shadow Server 侧权限，插件 action gate 较薄 | P1 |
| Product-specific features | poll、sticker/emoji、role、channel/category、event、moderation、presence、voice/TTS | 多数未实现，是否需要取决于 Shadow 产品边界 | P2 |

### P0：先补 OpenClaw 一等频道能力

P0 不追求复制所有 Discord 产品功能，目标是补齐 OpenClaw runtime 认为“成熟频道”应具备的能力。

1. **补齐基础 message actions**
   - 新增 `read`：读取当前频道、线程或 direct channel 的历史消息，支持 `limit`、`before`、`after`。
   - 新增 `search`：按 query、server、channel、author、attachment 条件搜索消息。
   - 新增 `pin`、`unpin`、`list-pins`：如果 Shadow Server 已有 API，插件直接对齐；如果没有，先补服务端 API 和 SDK。
   - 新增 `thread-create`、`thread-list`、`thread-reply`：用 OpenClaw action 名称，不引入 Shadow 特有别名。

2. **实现 Directory 与 Target Resolver**
   - 插件提供 `directory.listPeers`、`directory.listGroups`。
   - 支持按 server/channel/member/buddy 名称解析到目标 ID。
   - `message` tool 在频道内调用时可使用当前频道作为 fallback，不要求 Agent 手写 UUID。
   - 保留显式 target：`shadowob:channel:<id>`、`shadowob:thread:<id>`；direct channel 也使用 `shadowob:channel:<id>`。

3. **对齐 Conversation Bindings**
   - 使用 OpenClaw `conversationBindings` contract，而不是只维护插件私有 JSON。
   - 支持当前会话绑定、线程子会话、父子会话展示、idle timeout、max age。
   - 线程归档、删除、权限失效时清理绑定，避免重启后路由漂移。

4. **统一 Interactive/Presentation 模型**
   - 保留 Shadow 现有交互组件，不删除产品能力。
   - `send` 同时接受 OpenClaw `interactive` 和 `presentation` payload，并转换为 Shadow metadata。
   - buttons、selects、forms、approval 都走同一套 schema、server state 和回执上下文。
   - 提交后的 source prompt、responsePrompt、submitted values 必须进入 Agent 上下文。

5. **状态上报只保留一个真实状态源**
   - Buddy 的 typing/thinking/working/activity 在插件内形成明确状态机。
   - 前端只展示聚合后的频道工作状态，不分别显示多个重复的 typing/thinking。
   - 所有 start/stop/timeout 都要有 finally cleanup，避免“输入中”或“思考中”悬挂。

### P1：补稳定性、诊断与媒体完整性

1. **Media pipeline 完整化**
   - 支持 `media`、`mediaUrl`、`path`、`filePath`、`file`、`fileUrl`、`buffer`。
   - 支持多附件顺序发送和失败局部降级。
   - 使用 OpenClaw media access/local roots/readFile 读取本地文件，避免 Agent 看到 action 存在但实际发不出去。
   - smoke 测试必须走真实 OpenClaw `message` tool 路径，而不是只调用插件内部 helper。

2. **Status / Doctor / Audit**
   - 账号 probe 不只检查 token，还检查 server reachability、bot identity、remote config、WebSocket、heartbeat。
   - 频道诊断检查 listen/reply policy、目标频道权限、当前 Buddy 是否加入 server/channel。
   - `/ready` 和 Cloud 部署状态要能区分：容器活着、OpenClaw ready、Shadow connected、目标频道可达、Agent auth 可用。

3. **Action gate 与安全**
   - 按账号和服务器配置启用/禁用 action。
   - 对高风险 action 做 requester sender 校验。
   - 所有 action 返回结构化错误，不让 Agent 误判“工具不可用”或切回伪实现。

4. **配置与 setup 收敛**
   - Shadow Cloud 负责生成配置，但插件仍应能描述配置缺失、账号禁用、token 过期和模型 auth 缺失。
   - 禁止保留旧 action、旧 prompt、deprecated alias。
   - 配置写入发生在 OpenClaw 启动前；启动后配置变更必须走 OpenClaw reload contract。

### P2：按产品边界选择性追平 Discord 产品功能

这些能力不是 OpenClaw 一等频道的前置条件，但如果 Shadow 要做完整社区协作体验，可以逐步加入：

- poll：频道投票。
- emoji/sticker：表情、贴纸发送与上传。
- member/role：成员信息、角色信息、角色授予/移除。
- channel/category：频道和分类创建、编辑、删除、排序。
- event：服务器活动列表与创建。
- moderation：timeout、kick、ban。
- presence：设置 Buddy 在线状态和活动。
- voice/TTS：语音频道、语音消息、TTS。

这些功能必须以 Shadow Server 产品 API 为准，不为了“看起来像 Discord”而在插件里伪造。

### 实施顺序

1. **能力盘点与 contract 测试**
   - 固定当前 action surface snapshot。
   - 增加与 OpenClaw message tool 的 contract 测试，保证 action 名称和 target 模式不会回退。

2. **P0 action + directory**
   - 实现 `read/search/thread-* / pin-*`。
   - 增加 SDK 方法、API 文档和 Python SDK 同步。
   - 增加真实 OpenClaw CLI smoke：Agent 调 message tool，Shadow 侧真实读回。

3. **conversationBindings**
   - 接入 OpenClaw binding contract。
   - 添加线程、重启、跨上下文、归档清理测试。

4. **interactive/presentation 收敛**
   - `send` 接受 OpenClaw `interactive`/`presentation`。
   - 原 Shadow metadata 作为渲染层实现细节，不作为 Agent-facing 旧接口扩散。

5. **media 与 status doctor**
   - 媒体补全本地文件、多附件和错误降级。
   - 增加 `/ready`、Cloud 部署状态和插件 status 的一致性检查。

6. **P2 产品功能按需推进**
   - 每个功能先补 Shadow Server API，再补 SDK，再补插件 action，再补 Web/Mobile UI 和 E2E。

### 验收标准

每个阶段都必须满足：

- 单元测试覆盖 schema、target mode、action gate、错误返回。
- 集成测试覆盖 Shadow REST API、SDK、插件 action 的真实路径。
- 容器 smoke 覆盖 OpenClaw `message` tool 到 Shadow Server 的端到端路径。
- Web 和 Mobile 对新增 UI/交互能力保持一致。
- 所有 UI copy 走 i18n。
- 不新增 deprecated alias，不保留“兼容旧版本”的隐藏分支。
- 文档同步 API、TypeScript SDK、Python SDK 和 smoke 命令。

### 非目标

- 不把 Discord 的 guild/role/moderation 模型原样塞进 Shadow。
- 不在 runner entrypoint 或 Cloud handler 中写 Shadow 特例。
- 不通过 prompt 教 Agent 使用不存在的 action。
- 不用“直接贴文件内容”“告诉用户工具不可用”来替代真实文件发送能力。
- 不让前端自行猜测 Buddy 状态；状态机必须由后端和插件统一驱动。
