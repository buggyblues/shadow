# 云电脑连接器：声明式插件与运行时账号的协调方案

## 目标

云电脑里的“连接器”不是一套新的集成平台，也不是 OpenConnector 的嵌入版本。它是现有
Cloud 插件系统的运行时配置入口：用户通过 Web 或 Mobile 选择插件、连接账号，Buddy 随后
直接获得插件提供的 CLI、Skill、MCP 和运行依赖。

设计约束：

- 插件 manifest 是唯一能力目录，不复制 provider 定义。
- 账号连接属于用户，可复用到多台云电脑；界面不增加独立账号管理概念。
- 实际部署仍由 Buddy 和 Cloud deployment 完成，不增加 GitHub 同步或任务编排系统。
- 不增加 Projects、App 管理页或另一套生命周期。
- 运行时配置不得把凭证明文写进 deployment snapshot。

## 借鉴 OpenConnector 的部分

保留三类成熟模式：

1. 可搜索目录、状态筛选、连接卡片和单项配置弹窗。
2. 保存前校验凭证，只向客户端返回账号摘要和连接状态。
3. 凭证集中加密，使用时短暂解密，不通过查询 API 回传。

不引入 OpenConnector 的 action gateway、provider runtime 或独立连接器协议。Shadow 插件本身
已经定义了运行时能力，重复引入会形成两套目录、两套鉴权和两套执行路径。

## 协调模型

声明式配置和运行时配置分工如下：

| 层 | 负责内容 | 持久化位置 |
| --- | --- | --- |
| Plugin manifest | 名称、认证字段、可配置项、CLI/Skill/MCP、运行依赖 | `apps/cloud/src/plugins` |
| Cloud template | 云电脑默认安装哪些插件、默认行为 | deployment config `use` |
| 用户账号 | 某个用户连接了哪个外部账号 | `cloud_connector_connections`，KMS 加密 |
| 云电脑覆盖层 | 这台云电脑启用哪些连接器、选项和应用状态 | `cloud_computer_connectors` |
| 部署快照 | 插件声明和不透明凭证引用 | `config_snapshot.__shadowobRuntime` |

运行时覆盖层只能做 manifest 允许的操作：启用一个已注册插件、填写 manifest 的 auth 字段、
修改 manifest config schema 公开的选项。它不能上传任意脚本，也不能替换插件实现。

## 应用流程

1. 客户端读取 `/api/cloud-computers/:id/connectors`，目录由 `listPluginLibrary()` 生成。
2. 用户填写凭证与选项。服务端按 manifest 丢弃未知字段并检查必填项。
3. 用户可以手动填写凭证，也可以使用 manifest 声明的 OAuth；两者最终写入同一账号记录。
4. GitHub、Notion、Stripe 使用只读身份接口校验；其他 provider 先执行结构校验。
5. 凭证作为一个 AES-GCM/KMS payload 保存，响应只包含账号名、头像、scope 和校验时间。
6. Cloud Computer facade 在当前配置的 `use` 中合并插件，auth option 写为 `${env:KEY}`。
7. runtime metadata 只写入 `__SHADOW_CLOUD_CONNECTOR__:<connectionId>:<field>` 引用。
8. deployment processor 在构建运行环境前校验 connection 所属用户，解密并替换引用。
9. 同 namespace redeploy 安装插件运行依赖，状态从 `applying` 进入 `ready` 或 `error`。

断开时，运行时新增的插件会从 `use` 移除；模板原本声明的插件会保留，但账号字段和运行时
凭证引用会移除。用户级凭证保留，以便之后在另一台云电脑直接复用。

## 安全边界

- GET 响应永远不含 credential value、ciphertext 或内部 connection id。
- 浏览器和移动端不会回填已保存密钥；空字段表示沿用现有值。
- deployment snapshot、日志和 API 错误中只出现不透明引用，不出现凭证明文。
- deployment processor 按 `connectionId + deployment.userId` 双重约束解析引用。
- provider 校验响应只保留账号摘要；不保存 provider 返回的完整对象。
- 动态配置仅接受 manifest 声明字段，未知 option 和 credential 会被丢弃。

## 当前范围与后续扩展

第一版使用“每用户、每插件一个账号”，避免在产品中引入账号选择器和连接管理页。需要多账号
时，可以在保持 Cloud Computer UI 不变的前提下扩展内部 connection 选择。GitHub 备份或源码
同步也只消费已连接账号，由 Buddy 执行具体 git 操作。

## OAuth 协调机制

OAuth 配置仍属于 manifest 的 `auth.oauth`，包括授权端点、令牌端点、scope、PKCE、令牌端点
认证方式和响应字段映射。插件目录生成器必须完整保留这一段配置，Web、Mobile 和服务端共用
同一份生成目录。

平台按插件配置 OAuth Client，用户不需要理解“创建 OAuth App”：

```text
CLOUD_CONNECTOR_OAUTH_ORIGIN=https://shadow.example
CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_ID=...
CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_SECRET=...
```

连接时服务端生成 15 分钟有效的一次性 state，只持久化 state 的哈希；支持 PKCE 的 provider
同时生成 S256 challenge，加密保存 verifier。回调由服务端交换 code，access token、refresh
token、过期时间和 scope 一并写回现有 `cloud_connector_connections`。部署前若令牌即将过期，
服务端先刷新并更新密文，再解析运行时引用。客户端只轮询 flow 的 `pending / exchanging /
completed / error / expired` 状态，从不接收 token。

首批启用 OAuth 的 13 个插件是：Canva、Figma、GitHub、Google Workspace、HubSpot、
Hugging Face、Linear、Notion、PostHog、Salesforce、Sentry、Supabase、Tencent Docs。
Google Workspace 的 broker access token 映射到 gws 官方支持的
`GOOGLE_WORKSPACE_CLI_TOKEN`；导出的 credentials JSON 和 service account 仍作为手动连接备用。
Google Analytics 暂不启用 broker。

## 云电脑 UI 设计

连接器目录不再把“连接状态”和“连接方式”混在同一个标签里。卡片同时表达两条信息：

- 运行状态：可连接、应用中、已连接、需要处理。
- 连接方式：账号授权、手动凭证、无需账号。

Web 和 Mobile 使用相同的三态判断：manifest 存在可用的 `auth.oauth.accessTokenField` 时归入
“账号授权”；没有 auth field 时归入“无需账号”；其余归入“手动凭证”。

目录可以按这三种方式筛选。进入配置弹窗后：

1. OAuth 已配置时，把账号授权作为主操作，手动凭证作为备用操作。
2. manifest 支持 OAuth、但平台 Client 尚未配置时，显示原因和手动连接方案，不显示不可操作的
   OAuth 按钮。
3. 无需账号的插件使用“启用”，不出现账号或凭证语义。
4. 已连接账号显示实际使用的是 OAuth 还是已保存凭证；插件安装状态继续单独展示。

OAuth 连接器默认不展开 Token 字段；只有用户主动选择“高级选项：改用 Token”才显示手动凭证。
GitHub 优先使用连接器专用 OAuth Client，未配置时复用平台登录的 `GITHUB_CLIENT_ID` 与
`GITHUB_CLIENT_SECRET`，并通过已有 GitHub 回调将连接器 state 转交给统一 broker。

这样用户可以先判断“能否直接用、是否需要登录”，再进入具体配置，同时不增加连接器管理页或
独立账号中心。
