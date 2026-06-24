# Buddy 协作默认配置方案

Status: proposal
Date: 2026-06-12

相关文档：

- [Buddy 任务协作暂存方案](./buddy-task-collaboration-deferred-plan.zh-CN.md)
- [同频道多 Buddy 协作方案（历史方案）](./multi-buddy-channel-collaboration.zh-CN.md)
- [Buddy Access Policy](../api/buddy-access-policy.md)

## 结论先行

默认配置的目标是让普通频道像 IM 一样安静、可预测，同时让用户明确点名多个 Buddy 时能自然进入 Thread 协作。

本方案只处理普通频道主线程和普通 Thread 的协作体验。Task Card、Kanban、任务状态同步、子任务结果卡片先放到单独文档，后面统一制定。

新的默认模型：

- Inbox 默认回复所有消息，用于和单个 Buddy 持续对话。
- 普通频道主线程默认仅 @ 时回复，防止 Buddy 随机插话。
- `replyToBuddy` 只限制普通频道主线程里的 Buddy-to-Buddy 自动回复，不限制 Thread。
- 用户 @ 两个及以上 Buddy 时，平台自动创建或复用 root Thread。
- 被 @ 的 Buddy 进入 Thread session，用 reaction 作为轻量协调信号：先发送 `👌` reaction 到 Thread 根消息，再检查自己是否是第一个 reaction 发起者；第一个发言，其它 Buddy 静默。
- 当前默认方案不引入中心化发言抢占或多轮自治调度机制。

## 回复策略默认值

| Surface | 默认回复策略 | 说明 |
| --- | --- | --- |
| Buddy Inbox | 回复所有 | Inbox 是用户和单个 Buddy 的工作空间，默认允许持续对话。 |
| 普通频道主线程 | 仅 @ | 主线程是多人 IM，默认只有明确点名才触发 Buddy。 |
| 普通 Thread | 按 Thread session/context | Thread 是已收拢的上下文，不套用主线程的 `replyToBuddy` 限制。 |
| DM | 回复所有 | DM 等价于用户和 Buddy 的直接对话。 |

这里的“回复所有”仍受成员关系、权限、listen 开关、租户/owner 触发权限和安全策略限制；它不是绕过授权。

## `replyToBuddy` 的作用域

`replyToBuddy` 的核心目标是防止 Buddy 消息污染普通频道主线程。

适用范围：

- 只适用于普通频道主线程。
- 只控制 Buddy-authored message 是否能触发另一个 Buddy 在主线程自动回复。
- 默认值应为 `false`。

不适用范围：

- 不限制 Inbox。
- 不限制 DM。
- 不限制普通 Thread。
- 不限制显式由用户 @ 多个 Buddy 后创建的 Thread session。
- 不限制未来 Task/Runtime 协议；Task 机制另行设计。

因此，`replyToBuddy=false` 的含义不是“Buddy 永远不能回复 Buddy”，而是“普通频道主线程不允许因为 Buddy 消息继续扩散”。Thread 内是否继续，由 Thread session、reply context 和 runtime 注入提示词控制。

## 普通频道主线程规则

### 未 @ Buddy

默认静默。

如果频道显式配置了唯一主回复 Buddy，可以允许该 Buddy 短答；多个 Buddy 同时配置为自动回复人类消息时，应降级为仅 @，避免默认冲突。

### 单 @ Buddy

只有被 @ 的 Buddy 回复。

未被 @ 的 Buddy 必须静默，不发送“我不回答”“不归我处理”之类解释文本。

### @ 两个及以上 Buddy

平台自动创建或复用 root Thread，并把本次协作收拢进 Thread。

主线程只保留用户 root 消息和 Thread 入口，不让多个 Buddy 在主线程连续刷屏。

## 多 Buddy Thread 协作机制

当一条主线程 root 消息 @ 了两个及以上 Buddy：

1. 服务端创建或复用 root message 的 Thread。
2. 运行时 remote config / message payload 明确标记这是 `multi_buddy_thread` 场景，并给出 `threadId`、`rootMessageId`、被 @ 的 Buddy 列表。
3. 每个被 @ 的 Buddy fork 或恢复自己的 Thread session。
4. Runtime 向 Thread session 注入短提示词，要求该 Buddy 先对 Thread 根消息发送 `👌` reaction。
5. Buddy 发送 reaction 后读取 Thread 根消息 reactions。
6. 如果自己是第一个对该根消息发送 `👌` reaction 的被 @ Buddy，则在 Thread 中发言。
7. 如果不是第一个，则静默；后续只有用户再次 @、reply、或 Thread session 明确要求时才继续。

这个机制把协调成本压到一个可见且低噪声的 reaction 上：

- 用户能看到哪些 Buddy 收到了邀请。
- 只有一个 Buddy 给出首答，避免并发长回复。
- 其它 Buddy 不需要发“同意”“我补充一下”。
- 没有隐藏的中心抢占状态，也不需要多轮调度。

## Reaction 判定规则

`👌` reaction 是本方案里的轻量参与确认信号。

判定原则：

- 只统计 root message Thread 中根消息上的 `👌` reaction。
- 只统计本次 root 中被 @ 的 Buddy。
- 排序以服务端 reaction 记录的创建时间为准。
- 如果同时写入导致时间相同，使用服务端稳定排序作为兜底，例如 reaction id 或 user id。
- 第一个 reaction 发起者获得首答资格。
- 非第一个 reaction 发起者静默，不在 Thread 里解释。
- reaction 失败时，runtime 静默或稍后重试一次；不要退回主线程正文解释。

这个规则只解决“多人被 @ 后谁先说第一句”。它不设计多轮辩论，也不保证任务分工。

## Runtime 合约

所有 runtime 默认应遵守同一组边界：

- Inbox 消息默认可回复。
- 普通频道主线程消息默认仅 @ 时处理。
- 普通频道主线程里的 Buddy-authored message 受 `replyToBuddy` 限制；默认不处理。
- Thread 内消息不受 `replyToBuddy` 限制，但必须绑定 thread session/context。
- `multi_buddy_thread` 场景下，runtime 必须 fork 或恢复 Thread session。
- `multi_buddy_thread` 场景下，runtime 必须先发送 `👌` reaction，再检查自己是否是第一个 reaction 发起者。
- 不是首个 reaction 发起者时，runtime 必须静默。
- 工具日志、terminal 输出、memory、skill、自我改进和内部状态不作为 IM 正文发送。

建议注入给 runtime 的提示词保持短而硬：

```text
这是多人 Buddy Thread 场景。你被用户明确 @ 参与。
先对 Thread 根消息发送 👌 reaction，然后读取该根消息 reactions。
如果你是第一个发送 👌 的被 @ Buddy，则在当前 Thread 给出一次简洁回应。
如果你不是第一个，则保持静默，不解释、不补充、不发送同意文本。
不要把工具日志或内部状态发到频道。
```

## UI/UX 原则

- 普通频道策略文案应显示“主线程仅 @ 时回复”，而不是让用户误以为 Buddy 会在所有地方沉默。
- `replyToBuddy` 设置旁必须说明“仅限制普通频道主线程；Thread 不受此项限制”。
- 多 @ Buddy 后，主线程应立即出现 Thread 入口或轻量状态，让用户知道协作已收拢。
- Thread 根消息的 `👌` reactions 可以作为“已收到邀请”的可见反馈。
- 只有首个 Buddy 发送正文，其它 Buddy 只留下 reaction，不刷“我同意”“我不补充”。

## 迁移计划

### Phase 0: 文档与配置审计

- 用本文作为当前默认协作方案。
- 将旧同频道多 Buddy 方案保留为历史记录。
- 盘点服务端默认配置、频道策略、runtime remote config 和 UI 菜单中的 `replyToBuddy` 使用点。
- 盘点普通 Thread 与主线程的消息 payload 是否能让 runtime 明确区分。

### Phase 1: 默认配置收口

- Inbox 默认回复所有。
- 普通频道主线程默认仅 @。
- 普通频道主线程默认 `replyToBuddy=false`。
- UI 和 API 文档写明 `replyToBuddy` 只限制普通频道主线程。
- 多 Buddy 自动回复人类消息的频道配置默认降级为仅 @，除非有唯一主回复 Buddy。

### Phase 2: Thread 协作入口

- 主线程 root @ 两个及以上 Buddy 时，服务端自动创建或复用 Thread。
- message payload / runtime config 标记 `multi_buddy_thread` 场景。
- runtime 根据 `threadId` fork 或恢复 Thread session。
- runtime 注入多人 Thread 协作提示词。

### Phase 3: Reaction 协调

- runtime 使用结构化 reaction action 对 Thread 根消息发送 `👌`。
- runtime 读取 reactions 并判断自己是否首个被 @ Buddy。
- 首个 Buddy 在 Thread 中发言，其它 Buddy 静默。
- 不做正文 `+1`、`同意`、`👌` 的解析或转换。

### Phase 4: 清理旧控制面

- 普通频道协作路径停止依赖旧中心化发言控制面。
- 保留历史 metadata 只读展示，不再把它作为自动接话条件。
- 需要任务协作、Kanban、子任务结果时，另按 Task 文档统一设计。

## 验收标准

- Inbox 默认可以连续对话。
- 普通频道主线程未 @ Buddy 时默认静默。
- 普通频道主线程单 @ 时只有被 @ Buddy 回复。
- 普通频道主线程 @ 两个及以上 Buddy 时自动创建或复用 Thread。
- 被 @ Buddy 都会对 Thread 根消息发送 `👌` reaction。
- 只有第一个发送 `👌` reaction 的被 @ Buddy 在 Thread 发言，其它 Buddy 静默。
- `replyToBuddy=false` 不会阻止 Thread session 内按上下文工作。
- 主线程不会出现 Buddy 因另一个 Buddy 回复而继续自动刷屏。
