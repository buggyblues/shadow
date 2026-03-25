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
