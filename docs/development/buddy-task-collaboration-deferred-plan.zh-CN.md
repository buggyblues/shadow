# Buddy 任务协作暂存方案

Status: deferred
Date: 2026-06-12

本文暂存从默认 Buddy 协作方案中拆出的 Task / Kanban / Runtime 状态设计。它不是当前默认群聊协作方案的一部分，后续需要单独统一制定。

相关文档：

- [Buddy Inbox 任务模式与 Runtime 交互机制](./buddy-inbox-task-mode-mechanism.zh-CN.md)
- [Buddy Coordinator, Generic Kanban, And Runtime Skills Research Plan](./buddy-coordinator-kanban-runtime-research.md)
- [Buddy 协作默认配置方案](./buddy-collaboration-defaults-plan.zh-CN.md)

## 暂存结论

这些方向先保留，不在当前主方案中落地：

- 多 Buddy 工作是否统一走 Task Card、Buddy Inbox、Task Thread 和 Runtime Binding。
- Task Card 是否作为任务状态权威来源。
- Kanban 是否只作为任务状态的可视化和操作面，不另建 runtime 状态。
- 子任务结果是否回到父任务的 Task Thread。
- 子任务结果是否统一使用结构化 `task_result` card。
- `terminalTaskResultBody` 等硬编码正文协议是否清理为结构化 card 渲染。

## 待统一的问题

- Task Card、Kanban card、Runtime Binding 三者的状态边界。
- 人类 comment、需求修改、reopen、cancel、retry 的统一状态机。
- 子任务结果返回父任务时的权限、展示和去重规则。
- Task Thread 与普通 Thread 的 runtime session 关系。
- Web、Mobile、Kanban App 中任务状态和未读状态的一致性。

## 当前边界

当前 [Buddy 协作默认配置方案](./buddy-collaboration-defaults-plan.zh-CN.md) 只处理普通频道主线程和普通 Thread 的多 Buddy 体验。

Task / Kanban / 子任务结果不应混入普通频道默认协作方案，避免把 IM 协作、任务执行和看板状态三套问题绑在一起。
