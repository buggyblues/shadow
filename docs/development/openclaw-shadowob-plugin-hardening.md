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
- 容器冒烟测试：启动 Shadow Server、OpenClaw、`openclaw-shadowob` 插件和至少一个 Buddy 账号，验证 `/ready`、WebSocket 连接、消息往返和一条附件或表单链路。
- 多账号冒烟测试：至少两个 Buddy token 连接同一服务器，映射不同 agent，验证连接状态和一轮 buddy-to-buddy 策略。
- 定时任务冒烟测试：通过 OpenClaw cron/heartbeat 触发一次消息，确认 Shadow 频道实际收到投递，而不是只在 OpenClaw 日志里完成。

## 完成标准

- `pnpm --filter @shadowob/openclaw-shadowob test`、`typecheck` 通过。
- 插件大文件显著拆分，单个新模块职责清晰；兼容入口不破坏现有 import。
- 不向通用 runner image 或 Cloud handler 增加 Shadow 特例。
- 关键失败路径有明确日志，能够区分：OpenClaw 未生成、reply pipeline 未 flush、Shadow REST/WebSocket 投递失败、频道策略拦截、账号未配置或服务器不可达。
- 在缺少 LLM Key 时，测试应明确标记为跳过或使用 mock；存在 `.env` Key 时，容器冒烟测试可以直接跑通。
