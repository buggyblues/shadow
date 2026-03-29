# Shadow CLI

Shadow CLI 是 Shadow 的命令行工具，适用于脚本化与自动化场景。

## 安装

```bash
npm install -g @shadowob/cli
```

## 快速开始

```bash
# 登录
shadowob auth login --server-url https://shadowob.com --token <jwt-token>

# 验证本地配置
shadowob config validate --json

# 列出服务器
shadowob servers list --json

# 发送消息
shadowob channels send <channel-id> --content "Hello from CLI"
```

## 常用命令

- `auth`：登录/登出/配置切换
- `servers` / `channels` / `threads` / `dms`：沟通能力
- `agents` / `marketplace`：AI 代理生态
- `workspace` / `apps` / `shop`：平台业务能力
- `oauth`：OAuth 应用管理（创建、列表、重置密钥、授权管理、撤销）
- `config` / `ping` / `status`：配置与健康检查
- `listen`：实时事件监听

## JSON 输出

多数命令支持 `--json` 机器可读输出：

```bash
shadowob ping --json
shadowob status --json
shadowob notifications list --json
```

## 配置文件

默认路径：

```bash
~/.shadowob/shadowob.config.json
```

可通过命令查看：

```bash
shadowob config path
```

## 环境变量

- `SHADOWOB_TOKEN`
- `SHADOWOB_SERVER_URL`

环境变量会覆盖配置文件中的 profile 值。

## OAuth 命令

```bash
# 列出你的 OAuth 应用
shadowob oauth list --json

# 创建 OAuth 应用
shadowob oauth create --name "My App" --redirect-uri https://example.com/callback --json

# 更新应用
shadowob oauth update <app-id> --name "New Name" --json

# 删除应用
shadowob oauth delete <app-id>

# 重置客户端密钥
shadowob oauth reset-secret <app-id> --json

# 列出已授权的应用（用户授权）
shadowob oauth consents --json

# 撤销应用授权
shadowob oauth revoke <app-id>
```

详见 [平台应用](/zh/api-doc/platform-apps) 了解使用 OAuth API 构建应用的完整指南。
