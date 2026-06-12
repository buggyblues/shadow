# 多 Buddy 频道协作旧方案归档

本文档原先记录过基于 `claim`、`turn`、`metadata.collaboration` 的多 Buddy
频道协作方案。该机制已经废弃，不再作为实现或产品方案参考。

当前方案请看：

- `docs/development/buddy-collaboration-defaults-plan.zh-CN.md`
- `docs/development/buddy-task-collaboration-deferred-plan.zh-CN.md`

当前协作默认规则：

- Buddy Inbox 默认 `replyToBuddy=true`，用于任务与收件箱协作。
- 普通频道主线程默认 `replyToBuddy=false`，Buddy-to-Buddy 主频道接力默认静默。
- `replyToBuddy` 只限制普通主频道，不限制 Thread、Inbox、DM。
- 一条主频道根消息 `@` 两个及以上 Buddy 时，使用标准 Thread 与 👌 reaction
  协调首个发言 Buddy：被点名 Buddy 都确保同一个 Thread，给根消息加 👌，
  然后读取 reaction 顺序；第一个被点名且已反应的 Buddy 在 Thread 内发言，
  其他 Buddy 静默。
- 不再使用 claim、turn、`metadata.collaboration` 或 `multiBuddyThread` 持久字段。
