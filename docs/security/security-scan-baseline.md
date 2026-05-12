# 安全扫描基线说明

本次新增了 `tools/security/security-scan.mjs`，并已在当前代码上运行一次报告模式。

当前扫描器会检测：

- Handler 直接 import DAO。
- Handler 直接 `container.resolve('*Dao')`。
- 服务端直接 `fetch(...)`。
- Kubernetes 高危 runtime 操作绕过 Gateway。
- 私有对象 stream 读取绕过 MediaAccessGateway。
- Service 层直接触发钱包副作用。
- DAO / Service 中全局 ID 写方法。
- 父资源路由里疑似调用 child-only 写方法。

当前基线仍有历史 error / warning，主要集中在旧 Cloud SaaS runtime、旧 OAuth/模型/通知/语音外部 HTTP 请求、以及 Handler 直接 resolve DAO 的遗留架构。CI 已以 report mode 接入，避免立刻阻塞开发。

建议迁移策略：

1. 先清 error：SSRF、K8s 危险动作、私有对象读取。
2. 再清 warn：Handler DAO、全局 ID 写方法、钱包副作用。
3. 每个模块迁移后生成报告对比，不允许新增 error。
4. error 清零后改为 fail mode。
