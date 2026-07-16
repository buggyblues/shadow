# 社区投票与 Space App 集成调研

本文调研 Discord Poll 的产品和 API 设计，并结合当前 Shadow 社区、消息卡片、权限、Buddy 与 Space App 体系，给出社区内集成投票的建议方案。

## Discord Poll 能力要点

Discord 的投票是消息的一种结构化能力，而不是独立频道对象。用户可以在文本频道、语音频道文本区、群聊、私信和公告频道创建投票；投票题目与选项会经过 AutoMod 过滤；投票最多 10 个选项，可为选项配置 emoji；客户端常用时长包括 1 小时、4 小时、8 小时、24 小时、3 天和 1 周。投票期间用户可以取消或修改自己的票，投票不是匿名的。

开发者侧，Poll 对象挂在 Message 上，包含 `question`、`answers`、`expiry`、`allow_multiselect`、`layout_type` 和 `results`。创建投票使用 Create Message 的 `poll` 字段；创建后的投票消息不能编辑。官方 API 约束里，题目文本最长 300 字符，答案文本最长 55 字符，答案最多 10 个，API duration 以小时计并允许最长 32 天。投票结果在进行中时可能不是完全实时精确，结束后由后台任务最终汇总，`is_finalized` 表示最终结果已完成。应用不能替用户投票，只能通过受控接口读取或结束自己创建的投票。

参考资料：

- Discord Support: [Polls FAQ](https://support.discord.com/hc/en-us/articles/22163184112407-Polls-FAQ)
- Discord Developer Docs: [Poll Resource](https://docs.discord.com/developers/resources/poll)
- Discord Developer Docs: [Message Resource](https://docs.discord.com/developers/resources/message)

## Shadow 当前可复用基础

当前项目已经具备几块适合承载投票的基础：

- 消息已有 `metadata.cards` 统一卡片协议，Space App 分享卡统一使用 `space_app`，不再保留双类型兼容。
- 内容流索引已经能按消息 metadata 中的卡片类型建立搜索/聚合入口。
- Web 与 Mobile 都有消息气泡卡片渲染路径，适合增加同一份 `poll` 卡片。
- 社区已有服务器、频道、成员角色、Buddy、Inbox、通知、实时 socket 和应用命令/审批体系。
- Space App 已经有 manifest、launch token、command call、outbox、share bridge 和 Buddy grant。

这些基础说明，投票不应优先做成某一个 Space App 内部功能。更合理的边界是：社区提供统一的投票消息能力，Space App 通过受控 API 创建投票、监听结果、把投票结果写回自己的领域数据。

## 推荐产品边界

投票是社区通用协作能力，第一期应进入 Shadow 核心消息层：

- 普通成员在有权限的频道创建投票。
- Web 与 Mobile 都能创建、查看、投票、改票、结束投票。
- 投票作为消息卡片出现在频道中，可被搜索、引用、通知和内容流索引。
- Buddy 可以总结投票状态，但不能代替用户投票。
- Space App 可以发起投票请求并订阅结果，用于“把应用内决策带回社区”。

Space App 负责领域语义，不负责重新实现投票系统。例如 Travel Space App 可以请求创建“今晚吃哪家餐厅”的投票，并在投票结束后把获胜选项写回 trip decision；Kanban Space App 可以请求创建优先级投票，并把结果同步到 card metadata。

## 数据模型建议

建议新增一组核心表或等价持久模型：

- `polls`：`id`、`messageId`、`channelId`、`serverId`、`creatorId`、`question`、`allowMultiselect`、`status`、`expiresAt`、`finalizedAt`、`sourceSpaceAppId`、`sourceSpaceAppKey`、`createdAt`、`updatedAt`。
- `poll_options`：`id`、`pollId`、`position`、`label`、`emoji`、`metadata`。
- `poll_votes`：`pollId`、`optionId`、`userId`、`createdAt`、`updatedAt`，多选投票允许同一用户多 option，单选投票以事务替换旧票。
- `poll_result_snapshots` 可选：用于结束后冻结计数，避免历史消息受后续数据修复影响。

消息 metadata 可存轻量引用：

```json
{
  "cards": [
    {
      "id": "poll_01",
      "kind": "poll",
      "version": 1,
      "pollId": "poll_01",
      "title": "今晚团队晚餐选哪家？"
    }
  ]
}
```

渲染时由客户端批量拉取 poll summary，或由消息列表接口内联返回轻量 `poll` 摘要。为移动端首屏性能，建议消息列表内联题目、选项、当前计数、用户已投状态、截止时间和状态。

## API 建议

核心社区 API：

- `POST /api/channels/:channelId/polls`：创建投票并生成一条消息。
- `GET /api/messages/:messageId/poll`：读取投票详情。
- `POST /api/messages/:messageId/poll/votes`：提交、替换或取消当前用户投票。
- `POST /api/messages/:messageId/poll/end`：创建者、频道管理员或具备权限的角色提前结束投票。
- `GET /api/messages/:messageId/poll/voters?optionId=...`：按权限查看投票人列表。

Space App 接口：

- `POST /api/apps/:appKey/polls` 或 command capability `community.polls.create`：Space App 请求在指定频道创建投票。
- `GET /api/apps/:appKey/polls/:pollId`：读取与该应用相关的投票。
- `POST /.shadow/events/poll.finalized`：投票最终汇总后回调 Space App，或复用现有 command/outbox 事件投递。

Space App 不能使用应用身份替用户投票；如果应用要表达“系统建议”，应作为推荐选项、评论或 Buddy 消息，而不是 vote row。

## 权限与安全

建议新增权限能力：

- `CREATE_POLLS`：频道内创建投票。
- `MANAGE_POLLS`：结束任意投票、查看完整投票人列表。
- `SPACE_APP_CREATE_POLLS`：Space App 可通过审批在频道发起投票。

安全规则：

- 题目和选项走现有内容安全/AutoMod 管线。
- 选项数量默认最多 10；题目 300 字符；选项 55 字符，可与 Discord 对齐。
- 截止时间第一期支持 1 小时、4 小时、8 小时、24 小时、3 天、1 周；服务端可允许更灵活的小时数，但客户端先提供固定选项。
- 默认不匿名，投票人列表按权限展示；如果未来支持匿名，需要单独设计反作弊和审计。
- 投票结束后结果冻结，后续只允许管理员级修复任务改动。

## Web 与 Mobile 体验

Web：

- 消息输入区增加投票入口。
- 创建弹层包含题目、选项、emoji、多选开关、截止时间。
- 消息气泡渲染 `PollCard`，支持投票、改票、取消票、查看结果、结束投票。
- 频道权限不足时禁用入口并展示 i18n 提示。

Mobile：

- 输入附件/更多菜单增加投票入口。
- 创建页使用全屏表单，选项用可排序列表，投票卡片适配窄屏。
- 投票后立即本地乐观更新，失败时回滚并显示 i18n toast。

所有新增 UI 文案必须走 web/mobile 各自 i18n。不要在组件中硬编码中文或英文。

## 实时与通知

投票创建可复用消息创建事件。投票变化建议使用 `message:update` 携带 poll summary，或新增 `poll:updated` 事件并让客户端同步失效对应 message/poll query。

通知策略：

- 被 @ 提及的投票消息按普通消息通知。
- 投票结束只通知创建者、关注该消息的人、以及 source Space App 关联的 Buddy/owner。
- 高流量频道不对每次投票变更发通知，只做实时 UI 更新。

## 分阶段落地

P0：社区投票 MVP。

- 数据表、API、权限、消息卡片、Web/Mobile 创建和投票。
- 支持单选/多选、截止时间、结束投票、结果冻结。
- 单元测试覆盖 vote replace、多选、过期、权限；集成测试覆盖创建消息、投票、结束。

P1：Space App 集成。

- manifest capability 增加 `community.polls.create`。
- Space App command/outbox 可请求创建投票。
- 投票结束事件回调应用，Travel/Kanban 任选一个做样例。

P2：高级能力。

- 匿名投票、投票模板、定时投票、结果导出、Buddy 总结、投票结果自动触发 Space App workflow。

## 结论

Shadow 应把投票做成“社区消息层的通用决策原语”，而不是单独塞进某个 Space App。Space App 通过 capability 创建投票、订阅最终结果、把结果映射回自己的领域对象。这个边界既能贴近 Discord 的消息原生体验，也能和 Shadow 的 Space App、Buddy、Inbox、内容流和移动端统一起来。
