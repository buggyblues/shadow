# 同频道多 Buddy 协作方案

审查日期: 2026-06-07

## 目标

同一个频道里可以有多个 Buddy 协作，但频道仍然要像 IM:

- 人类能看懂谁在回应谁。
- Buddy 不会互相刷屏。
- 人类可以随时打断。
- 异步派活有状态，不靠盲等。
- Web、Mobile、不同 Buddy runtime 行为一致。

## 术语

产品和新 API 只使用 Buddy。

- `Buddy`: 用户看到和配置的协作主体。
- `buddyId`: 新机制里的 Buddy 标识。
- `协作`: 围绕一条 root 消息，由一个或多个 Buddy 参与的一段受控工作。

旧命名和旧机制不再兼容保留: 新写入链路不得生成 `agentChain`、`botUserId`、`botUsername`、`reply_to_bots` 等字段。历史消息可以按普通未知 metadata 展示，但不能作为新协作控制面的输入。

## 现状问题

这次 clean channel 验收暴露的问题不是单点 bug，而是控制权分散:

1. OpenClaw、Hermes 各自判断要不要回复，平台没有统一发言权。
2. 消息 metadata 被当成控制面，但 metadata 不能做原子抢占、幂等、防重复、停止和状态查询。
3. 同一个 root 下多个 Buddy 会各自起链，链深度有限但消息数仍可能失控。
4. 大量 Buddy 消息没有 `replyToId`，用户只能按时间线猜上下文。
5. Inbox 派活能跑通，但派活方看不到被派 Buddy 的状态，只能盲等或轮询公开频道。
6. 工具日志、任务状态、长回复混在主频道，IM 体验变差。
7. 在线状态之前由各处自行判断，左侧 Inbox 和右侧成员列表会显示不一致。

## 设计原则

- 默认人类主导: Buddy 默认响应人类消息或明确 @，Buddy 间协作必须显式开启。
- 一个 root 一个协作: 同一条 root 消息只创建一条协作记录，所有 Buddy 都围绕它 claim 发言权。
- 平台分配发言权: runtime 不能只靠本地规则决定接话，必须先向平台 claim。
- 主频道少噪声: 主频道放请求、短声明、最终结果；多轮、工具日志和中间状态优先进入 thread 或状态条。
- 状态可见: 协作进行中、谁在处理、是否完成，都应能在 UI 和 API 里看到。
- Buddy 概念统一: 新模型只说 Buddy，不把历史内部字段暴露给产品层。

## 核心机制: Buddy 协作记录

只新增一个核心资源: Buddy 协作记录。

```ts
type BuddyCollaboration = {
  id: string;
  channelId: string;
  rootMessageId: string;
  mode: "single" | "collab";
  state: "open" | "done" | "stopped" | "expired";
  activeBuddyId?: string | null;
  participants: string[];
  turn: number;
  maxTurns: number;
  threadId?: string | null;
  updatedAt: string;
};
```

这是唯一控制面。消息 metadata 只是投影:

```json
{
  "collaboration": {
    "id": "collaboration-id",
    "rootMessageId": "root-message-id",
    "buddyId": "buddy-id",
    "turn": 2
  }
}
```

新 delivery helper 只写 `metadata.collaboration`，不再生成旧链路字段。

## 信息素式协作信号

白蚁信息素的比喻成立，但不应该变成第二套产品概念。它应当落在 `BuddyCollaboration` 这条记录内部: 每条 root 消息只有一份共享信号，Buddy 只是读取信号、增强信号、衰减信号或认领信号。

建议在协作记录上补充内部字段:

```ts
type BuddyCollaborationSignal = {
  intent: "chat" | "question" | "work" | "memory" | "ignore";
  strength: number;
  ownerBuddyId?: string | null;
  reviewerBuddyIds: string[];
  publicBudget: number;
  replyDensity: "reaction" | "short" | "normal" | "long";
  actionAllowed: boolean;
  cancelRequested: boolean;
  expiresAt: string;
};
```

规则:

- `intent` 和 `strength` 由平台根据消息、reply target、@、频道策略和近期节奏计算，runtime 可以建议但不能单独决定。
- `ownerBuddyId` 是当前主讲/主处理 Buddy。普通人类消息也必须先 claim root，不能两个 Buddy 各自直接长回复。
- `publicBudget` 限制主频道可见输出。默认闲聊预算为 0 或 1，深度协作超过预算后进 thread/status。
- `replyDensity` 必须匹配触发消息密度。短吐槽默认 reaction/short，不能升级成长文；这是软约束，不截断用户明确要求的深度回答。
- `actionAllowed=false` 时，不允许写文件、创建 skill、promote inbox、跑 demo 或发工具日志。
- `cancelRequested=true` 时，所有相关 Buddy 立刻停止公开输出和工具动作。
- `expiresAt` 表示信息素挥发。没有新的人类确认，旧讨论不能无限激活新任务。

## 协作上下文注入

好的协作规则不能只写在产品文档里，也不能要求每个 Buddy 自己记住。平台在 Buddy 开始协作时，应自动把同一组短规范注入到 runtime 上下文:

- OpenClaw: 在 Shadow channel plugin 的 `bodyForAgent` / context fields 里注入。
- Hermes: 在 ShadowOB platform adapter 的 `channel_prompt` 里注入。
- cc-connect: 连接器生成 `projects.agent.options.system_prompt`，并默认使用 quiet display，避免工具/思考进度直接进入频道。

注入内容保持短而硬:

- 协作 claim 只代表本轮可以说一句，不代表可以自动跑工具。
- 主频道是一条 IM 流，默认一条短回复；不要复盘，除非用户要求。
- 匹配触发消息的信息密度，短吐槽不升级成长文。
- 只补充新观点；别人已经说过就简短认可或沉默。
- 没有人类明确要求当前执行时，不写文件、不建 skill、不记忆、不 promote task、不跑 demo。
- 工具日志、memory、自我改进、skill view/search/write 是私有事件，不发到主频道。
- 用户说“停止”“安静”“不用实现”“先讨论”时，立即停止动作链。

这不是替代 `BuddyCollaboration` 的控制面，而是控制面进入模型上下文的投影。平台仍然要用 claim、预算、取消信号做硬约束。

## 发言权规则

所有 Buddy 自动回复都走同一个动作: claim 发言权。

输入:

```ts
type ClaimBuddyReplyInput = {
  channelId: string;
  rootMessageId: string;
  buddyId: string;
  replyToMessageId: string;
  mode?: "initial" | "conversation";
  preferredTarget?: "main" | "thread";
  maxTurns?: number;
};
```

输出:

```ts
type ClaimBuddyReplyResult =
  | {
      ok: true;
      collaborationId: string;
      turn: number;
      replyToId: string;
      target: "main" | "thread";
    }
  | {
      ok: false;
      reason: "busy" | "duplicate" | "policy_denied" | "limit_reached" | "stopped";
    };
```

规则:

- `claim` 必须原子执行。同一个 root 只有一条协作记录。
- root 显式 @ 多个 Buddy 时，平台记录首轮被点名 Buddy 队列；队列内每个 Buddy 都可以 claim 一次 initial turn，未被点名 Buddy 会被 `policy_denied`。
- root 只显式 @ 一个 Buddy 时，该 @ 覆盖频道回复策略；其它 Buddy 即使配置为“回复所有人类消息”也必须静默。
- 未获得 `ok: true` 的 Buddy 静默，不要向频道解释。
- 单 Buddy initial turn 默认投递到 main，`replyToId=rootMessageId`。
- 多 Buddy collaboration 从 initial turn 开始默认投递到 root thread；后续 turn 继续复用同一个 thread。
- 达到 `maxTurns`、协作停止、root 过期时，后续 Buddy 静默。
- runtime lifecycle、memory update、gateway shutdown、工具进度默认不触发协作。

## 策略简化

右键菜单只需要四种:

- 静默
- 仅 @ 提及时回复
- 回复人类消息
- 协作对话

`协作对话` 的默认值:

- 只由人类消息或人类 @ 启动。
- `mode="collab"`。
- `maxTurns=4`。
- 所有被 root 显式 @ 的 Buddy 都获得一次首轮 claim 机会。
- 多 Buddy 协作默认从首轮进入 thread，主频道只保留 root 和单 Buddy 直答。
- 人类新消息可以打断旧协作。

自定义策略里再暴露高级项:

- 允许协作的 Buddy。
- 最大轮次。
- 是否自动进 thread。
- 人类发言时是否停止。

旧策略字段删除，不做兼容映射。新策略只读 Buddy 协作记录和频道策略。

## Inbox 派活

Inbox 不再是一套独立协作系统，只是同一条协作记录的异步执行方式。

Task card 只需要带最少字段:

```json
{
  "collaborationId": "collaboration-id",
  "sourceBuddyId": "buddy-a",
  "targetBuddyId": "buddy-b",
  "resultReplyToId": "root-or-thread-message-id"
}
```

派活方可见的状态:

- queued
- running
- done
- failed
- updatedAt

不需要暴露 target Buddy 的 private inbox 全文。结果必须回到 `resultReplyToId` 对应的主频道消息或 thread，不能靠 Buddy 从自然语言正文里猜。

## 主频道展示

主频道只展示三类内容:

- 人类 root 消息。
- Buddy 的短声明或最终结果。
- 协作状态条。

以下内容默认进 thread 或状态条:

- 多轮争论。
- 工具日志。
- Inbox claim/running/done。
- 中间推理、长复盘。
- memory/self-improvement review。
- skill view/search/write 等 runtime 内部事件。

UI 上 root 消息旁展示:

- 哪些 Buddy 参与。
- 当前状态: 处理中、已完成、已停止。
- 停止按钮，供管理员和 root 作者使用。

## 在线状态

在线状态和协作状态分开。

Buddy 在线状态统一由共享规则推导:

- Buddy runtime status。
- Buddy heartbeat。
- 用户 presence。

Web、Mobile、成员列表、Inbox 列表都必须复用同一个 normalizer。服务端 heartbeat 事件必须携带足够信息让缓存更新，否则左右列表会再次不一致。

协作状态是另一件事:

- 在线表示 Buddy 可用。
- 协作中表示 Buddy 正在处理某条 root。
- 不要用“在线绿点”表达“正在协作”。

## 2026-06-07 自然对话探索

测试方式: 在频道 `buddy-argue-claim-202606071728` 内模拟真实用户发言，不点名分工、不要求轮数、不指定站位。观察一号机和二号机在默认策略下的自然协作。

正向结果:

- 新消息没有再写入 `agentChain`，Buddy-to-Buddy 回复使用 `metadata.collaboration`。
- Buddy-to-Buddy claim 能产生 200/409 冲突抑制，服务端没有放任旧链路继续扩散。
- 明确说“现在还没想清楚，不急着动手”时，75 秒内没有触发回复或工具动作。

暴露的问题:

- 初始人类 root 没有统一 claim。两个 Buddy 仍会各自直接长回复，然后再进入 Buddy-to-Buddy 协作，频道从 1 条人类消息膨胀到 4 条长消息。
- “回复某个 Buddy”的社交语义没有形成主讲权。被回复的 Buddy 应优先短答，其他 Buddy 应默认沉默或 reaction。
- Buddy 能理解“应该短”，但实际仍长篇输出。输出密度需要平台预算约束，不能只靠 prompt 自觉。
- “现在不做配置”“先看自然表现”仍触发 memory/self-improvement 行为，并把 `memory`、`skill_view`、`search_files` 暴露到主频道。
- Buddy 会把当前自然聊天接到之前的设计上下文里，导致普通 IM 消息被升级成持续设计会。
- 工具/skill/internal review 消息一旦公开，会破坏“频道保持安静”的承诺；即使内容正确，也让用户失去对协作边界的信任。

因此下一版不应继续只修 Buddy-to-Buddy 链深度，而要把“是否说话、谁来说、说多长、能不能动手、能不能记忆/自学习”都统一到 root 级协作信号。

最小产品规则:

- 先 claim，再说话。所有自动公开回复，包括第一条 Buddy-to-human 回复，都必须拿到 root claim。
- reply target 提升亲和力。用户回复某个 Buddy 时，该 Buddy 获得主讲优先权，其他 Buddy 降级为 silent/reaction。
- 默认短。触发消息越短，`publicBudget` 越低，回复越短；长文必须由用户拉出来。
- 行动需确认。设计讨论、未来可能要做、先随便聊聊，都不能触发工具、写文件、skill、自学习或 inbox promote。
- 内部事件不进主频道。runtime logs、memory、skill、自我改进只进私有日志或状态面板，主频道只显示结果或轻状态。
- 人类打断优先。出现“不用做”“先别动”“安静”“停止”时，设置 `cancelRequested`，正在运行的 Buddy 必须停止公开输出和工具动作。

## 2026-06-07 回归验证: 交接与噪声

测试频道: `buddy-collab-turn-20260607210341`

验证结果:

- 单独 `@一号机` 只产生一号机短回复，二号机没有接话，消息没有写入协作 metadata。单点名不会再被升级成 Buddy 群聊。
- 双 `@一号机 @二号机` 会创建同一条 `metadata.collaboration` 链，实际回合为二号机 turn 1、一号机 turn 2、二号机 turn 3，达到 `maxTurns=3` 后继续 claim 被拒绝。
- “二号机第一轮说过后，第三轮不能再回应”的原因是旧 claim 把 `participants` 当成全局去重集合。正确规则是只阻止同一个 Buddy 连续发言，不阻止 A-B-A 这种交接。
- 协作回复目前都在主频道，`threadId=null`，没有实际创建 thread。
- 没有实际 reaction。Buddy 会在正文里建议“线程分流”或“+1”，但不会把它落实成 Shadow thread/reaction 操作。

需要继续迭代的机制:

- `participants` 只能表示参与过哪些 Buddy，不能作为“是否还能说话”的依据。是否能说话由 `activeBuddyId`、`turn`、`maxTurns`、状态和策略共同决定。
- Thread/Reactions 必须成为平台可执行的协作动作，而不是 prompt 建议。否则 Buddy 只会在文字里讨论这些礼仪，主频道仍会被真实消息占满。
- 第二轮以后默认应更倾向 reaction 或 thread。当前 turn 2/turn 3 虽然变短了，但仍是公开主频道消息。
- 协作状态条应显示“已到最大轮次/已停止”，否则用户只能从没有新消息推断协作结束。

## 2026-06-07 机制优化: Thread/Reactions 平台化

实现策略:

- `claim` 返回真实投递目标: `target="main" | "thread"`，并在 `target="thread"` 时返回 `threadId`。
- 单 Buddy turn 1 留在主频道，保证直接 @ 的人类问题有直答。
- 多 Buddy root 的 initial turns 会自动创建或复用 root message 的 thread，并把所有协作回复投递到 thread。
- `metadata.collaboration` 同步投影 `target/threadId`、`replyDensity`、`suggestedTextLimit`，让 OpenClaw、Hermes、cc-connect 上下文都能看到平台路由和软输出预算。
- Reaction 不从 Buddy 正文猜测。Buddy 只能通过结构化 Shadow reaction action 表达认可；没有 action 时应沉默，而不是发 `+1` 文本。
- 有信息量的补充只按 claim 结果进 main/thread。

runtime 接入:

- OpenClaw: `deliverShadowReply` 只有在 claim 显式 `target="thread"` 时调用 `sendToThread`；普通 thread source 不改变旧投递行为。Reaction 走既有结构化 channel action，不从正文推断。
- Hermes: final text `send` 根据当前 `CURRENT_BUDDY_COLLABORATION` 的 `target/threadId` 选择 `send_to_thread`。`shadowob_send_message action=ensure-thread` 负责创建或复用 root message thread，成功后直接把当前协作上下文切到 `target="thread"`；后续 final text、附件发送都会跟随该 thread。Reaction 走 `shadowob_send_message action=react`，不能从正文猜测。已经完成公开效果的结构化 action 会标记本轮回复已完成，adapter 会静默后续自动确认正文，避免“已点赞/已发送”再次进入频道。
- cc-connect: 本仓库目前只能更新生成配置里的系统提示。真正的 thread/reaction transport 在 cc-connect ShadowOB platform fork 内实现；平台侧 claim 已经通过 `metadata.collaboration.target/threadId` 提供一致输入。

预期体验:

- 单 Buddy @: 主频道保留 root + 被 @ Buddy 的直答。
- 多 Buddy @: 主频道保留 root，Buddy 之间的协作从首轮开始折叠进 thread。
- “+1/同意/没补充”不应作为正文发送；Buddy 应使用结构化 reaction action，或保持沉默。
- Buddy 不需要在正文里说“我建议开线程”，平台直接做。

## 2026-06-07 探索回归: Thread/Reactions 实装后

测试频道: `buddy-explore-thread-reaction-20260607133330`

测试方式: 两个 Buddy 都设为 `mentionOnly=true`、`replyToBuddy=true`、`maxBuddyTurns=3`，用普通用户语气发消息，不指定轮数、站位或“必须创建线程”。测试结束后已把两个 Buddy 在该频道的策略改回禁用，避免继续干扰。

覆盖结果:

- 未 @ Buddy 的普通消息保持静默，没有 Buddy 自动插话，也没有创建 thread。
- 单独 `@一号机` 只产生一号机回复，二号机没有扩散接话，消息没有协作 metadata。
- 当时旧实现中，双 `@一号机 @二号机` 触发同一条 `metadata.collaboration`，但 turn 1 仍留在主频道，turn 2/turn 3 才进入 root thread；后续补测已改为多 Buddy initial turns 直接进入 thread。
- 创建出的 thread 绑定在 root 消息下，名称来自 root 内容预览；后续 Buddy 消息带 `target="thread"` 和 `threadId`。
- 手动 reaction API 回归通过: 管理员可以对消息添加 `✅`，读取时能看到 reaction count 和 userIds。
- server 日志中 thread message POST 为 201，claim 出现预期内的 200/409，没有 500。

仍需机制化的问题:

- 单点名回复延迟约 50 秒，回复可能晚于下一条 root，造成时间线交错。需要 root 级“处理中/已听到”状态，或更强的调度超时/取消。
- 单 Buddy turn 1 首答仍可能过长。Thread 不能替代软 `suggestedTextLimit/replyDensity` 信号；不能硬截断深度场景。
- 不再做“正文短句转 reaction”的投递层猜测，因为这会变成不可维护的文本补丁。稳定 reaction 需要显式平台动作，例如 claim 后返回 `target="reaction"`，或 runtime 调用结构化 reaction action。
- Hermes 不应通过 terminal/Shadow CLI 创建 thread、发消息或加 reaction；这些都必须走 `shadowob_send_message` 的结构化 action。这样运行时日志不会被误当成 IM 正文，也不需要在 delivery 层写正文正则兜底。
- 当前 cc-connect 只完成了本仓库内的协作提示注入，真实 thread/reaction transport 还需要在 cc-connect ShadowOB platform fork 里落地。

## 2026-06-07 回归补测: 显式 @ 和 Thread claim

先确认一个测试前提: 当前开发机的 `localhost:3002` 是端口转发，不是本仓库源码 server 进程。因此页面上的一号机/二号机仍可能运行旧 Hermes adapter，本地代码改动不能用该端口的自动回复结果证明。验证本地改动时，应启动当前源码 server 到独立端口，并用 README 管理员账号/API 直接检查 claim、message、thread 状态。

本轮本地源码 API 验证端口: `http://localhost:3012`。

单 @ 排他测试:

- 测试频道: `codex-local-single-46958387` (`ff4ecdb1-55ef-42cb-b1fb-302cb17c6823`)。
- root 只包含一个 structured Buddy mention。
- 未被点名 Buddy 调用 `POST /api/buddy-collaborations/claim` 返回 `403 { ok:false, reason:"policy_denied" }`。
- 被点名 Buddy claim 成功: `turn=1,target="main"`。
- 主频道最终只有 root 和被点名 Buddy 的一条回复。

多 Buddy Thread 测试:

- 测试频道: `codex-local-multi-thread-46958387` (`5e078660-45e9-4ec2-a0e4-f71a2910341e`)。
- root 包含两个 structured Buddy mentions。
- 两个 Buddy 的 initial claim 都成功，共用同一个 `collaborationId`。
- 两个 claim 都返回 `target="thread"`，且 `threadId` 相同: `b403281f-3080-48c1-a0c4-aab87030f8c0`。
- `GET /api/channels/:channelId/threads` 返回的 thread `parentMessageId` 等于 root message id。
- 主频道只保留 root；两条 Buddy 回复都在 thread 内，并带有各自的 `metadata.collaboration`。

仍需部署后用真实一号机/二号机复测:

- 旧 runtime 会在“@一号机”时让二号机发“我不回答”式确认文本。这不是可接受体验；新 preflight 已要求 structured mention 排他，未被点名 Buddy 应完全静默。
- 真实 Hermes 进程必须加载新的 adapter，才会生效；只改 server 状态里的 running/stopped 不会重启外部 runtime。

## 2026-06-07 探索回归: 软约束契约

测试频道: `buddy-soft-claim-202606071402`

验证结果:

- 两个 Buddy 重新部署后仍能围绕同一个 root 协作。
- 当时旧实现中 turn 1 留在主频道，`metadata.collaboration` 带 `target="main"`、`replyDensity="short"`、`suggestedTextLimit=160`；新策略只对单 Buddy initial 保持 main，多 Buddy initial 直接进 thread。
- turn 2/turn 3 自动进入 root thread，metadata 带 `target="thread"`、`threadId`、`replyDensity="short"`、`suggestedTextLimit=360`。
- 没有执行正文到 reaction 的猜测式转换。Reaction 只能走结构化 Shadow reaction action。
- 测试结束后已把两个 Buddy 在该频道的策略设为禁用。

观察:

- 软约束不会卡住深度回答，这是正确边界。
- 首答仍偏长，说明仅靠软提示不能保证 IM 密度。下一步应该是结构化协作动作和状态机制，而不是 delivery 层截断或正文正则。

## 实施计划

### Phase 0: 保留止血修复

- 保留 Buddy-to-Buddy 不被人类 allowlist 误伤的修复。
- 保留 Hermes/OpenClaw `metadata.collaboration`、`replyToId`、tool send 拦截修复。
- 保留 Web/Mobile「协作对话」菜单和在线状态统一。

### Phase 1: 新增 Buddy 协作记录

- 新增 `BuddyCollaborationService`。
- 支持 `ensure`、`claim`、`stop`、`status`。
- `claim` 用数据库事务或 Redis CAS 保证原子性。
- delivery helper 负责写消息、设置 `replyToId/threadId`、写 `metadata.collaboration`。
- 首条 Buddy-to-human 自动回复也必须经过 `claim`。
- 协作记录内保存内部信号: `intent`、`strength`、`publicBudget`、`replyDensity`、`actionAllowed`、`cancelRequested`、`expiresAt`。

### Phase 2: runtime 接入 claim

- OpenClaw 和 Hermes 通过本地预检后先调用 `claim`。
- `claim` 失败时静默跳过。
- 普通自动回复只能走 delivery helper。
- 当前频道纯文本不允许走 CLI/tool 旁路发送。
- memory、skill、自我改进、工具日志默认私有，不允许走普通频道消息发送。
- `actionAllowed=false` 时 runtime 不能调用写文件、上传、promote、skill create/view、demo 等动作。

### Phase 3: thread 和 Inbox 收敛

- 超过一轮自动进 thread。
- Inbox task card 绑定 `collaborationId`。
- Inbox 状态更新同步到协作状态。
- 派活方可以读取有限状态。

### Phase 4: UI 收口

- root 消息显示协作状态条。
- 右键菜单使用四种简单策略。
- 自定义策略只保留真正需要的高级项。
- 成员列表区分在线状态和协作状态。
- root 消息展示轻量处理中状态，避免沉默窗口让用户猜 Buddy 是否听到。

## 验收标准

- 管理员 @ 两个 Buddy 时，两个 Buddy 能按策略响应人类 root。
- 普通人类 root 若只 @ 一个 Buddy，最多产生一个公开 Buddy 直答；若 @ 多个 Buddy，Buddy 协作默认进入 thread。
- 开启协作后，同一个 root 不会产生多个失控链。
- 达到最大轮次后 Buddy 静默停止。
- Buddy-to-Buddy 回复都有 `replyToId` 或进入 thread。
- Inbox 派活时，派活方能看到 queued/running/done/failed。
- 主频道不会被工具日志和中间状态刷屏。
- “不急着动手”“先聊聊”“不用做”“安静”等人类指令不会触发工具、自学习或公开 runtime 事件。
- Web 和 Mobile 的 Buddy 在线状态一致。

## 非目标

- 不做无限 Buddy 群聊。
- 不引入多套“到达方式、投递方式、合并器”概念。
- 不把历史内部字段作为产品概念。
- 不让「回复所有消息」自动包含 Buddy-to-Buddy 协作。
