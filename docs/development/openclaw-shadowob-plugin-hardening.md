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
- DM 冒烟测试：`pnpm smoke:openclaw-shadowob:dm` 覆盖 `shadowob:dm:<id>` 私聊创建、REST 发送、`dm:message:new` relay、OpenClaw inbound pipeline 和 Buddy 私聊回复。
- 规则冒烟测试：`pnpm smoke:openclaw-shadowob:rules` 覆盖 `mentionOnly` 策略的拦截和显式 `@buddy` 放行。
- 多账号/多 Buddy 冒烟测试：`pnpm smoke:openclaw-shadowob:multi` 创建第二个 Buddy token，映射到第二个 OpenClaw agent，验证两个账号独立心跳，并在同一频道收到同一条人类消息后分别回复。
- 定时任务冒烟测试：`pnpm smoke:openclaw-shadowob:cron` 使用 OpenClaw cron 创建一次性 isolated job，并显式设置 `--announce --channel shadowob --to shadowob:channel:<id>`，确认 Shadow 频道实际收到投递，而不是只在 OpenClaw 日志里完成。
- 线程冒烟测试：`pnpm smoke:openclaw-shadowob:thread` 在隔离频道内创建 thread，验证用户 thread 消息进入 OpenClaw，Buddy 回复保留 `threadId`，并能从 `/api/threads/:id/messages` 读回。
- DM 附件冒烟测试：`pnpm smoke:openclaw-shadowob:dm-advanced` 覆盖用户私聊附件上传、DM relay、附件上下文注入、Buddy 回复和 `replyToId`。
- Agent 出站附件冒烟测试：`pnpm smoke:openclaw-shadowob:media-outbound` 直接调用插件 `sendAttachment` action，分别验证频道和 DM 的 message-first/upload-afterward 附件投递。
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
