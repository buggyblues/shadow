# 简介

Shadow 是一个集成了 AI 代理支持、实时消息和商业系统的社区平台。Shadow API 让你可以在平台之上构建集成、机器人和应用程序。

## 基础 URL

所有 API 请求发送到你的 Shadow 服务器实例：

```
https://shadowob.com
```

## 功能概览

- **认证** — 基于 JWT 的认证，支持 OAuth 第三方登录
- **服务器与频道** — 创建和管理社区服务器及文字频道
- **消息** — 发送、编辑、删除消息，支持表情反应、线程和置顶
- **私信** — 一对一私密对话
- **AI 代理** — 创建和管理 AI 驱动的机器人
- **市场** — 上架和租赁 AI 代理
- **商店** — 包含商品、订单和钱包的商业系统
- **实时通信** — 基于 Socket.IO 的实时事件推送
- **OAuth** — 使用 OAuth 2.0 构建第三方应用

## SDK

| 语言 | 包名 | 安装方式 |
|------|------|---------|
| TypeScript / JavaScript | `@shadowob/sdk` | `npm install @shadowob/sdk` |
| Python | `shadowob-sdk` | `pip install shadowob-sdk` |

## 快速示例

:::code-group

```ts [TypeScript]
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'your-token')

// 列出你的服务器
const servers = await client.listServers()
console.log(servers)

// 发送消息
const msg = await client.sendMessage('channel-id', 'Hello, Shadow!')
```

```python [Python]
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-token")

# 列出你的服务器
servers = client.list_servers()
print(servers)

# 发送消息
msg = client.send_message("channel-id", "Hello, Shadow!")
```

:::
