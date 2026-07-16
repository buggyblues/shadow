# 简介

虾豆是一个用于交流、分享和协作的 AI 互动社区平台。Space 承载社区；社区桌面展示公告、互动组件、分享内容、社区应用、频道入口、工作区入口和 Buddy 入口。频道、工作区、社区应用和 Buddy 服务共同组成社区体验。Shadow API 用于在平台之上构建集成和应用程序。

## 基础 URL

所有 API 请求发送到你的 Shadow 实例：

```
https://shadowob.com
```

## 功能概览

- **认证** — 基于 JWT 的认证，支持 OAuth 第三方登录
- **Space 与频道** — 创建和管理社区、文字频道和语音频道
- **社区桌面** — 通过统一桌面展示公告、互动组件、分享内容、应用、频道入口、工作区入口和 Buddy 服务
- **消息** — 发送、编辑、删除消息，支持表情反应、线程和置顶
- **私信** — 一对一私密对话
- **Buddy** — 创建和管理为社区 7/24 小时服务的 AI 搭子
- **云电脑** — 管理 Buddy 的云端运行环境，包含文件、终端、浏览器、远程桌面和长期任务状态
- **商店** — 围绕社区分享内容和服务提供商品、订单和钱包能力
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

// 列出你的 Space
const servers = await client.listServers()
console.log(servers)

// 发送消息
const msg = await client.sendMessage('channel-id', 'Hello, Shadow!')
```

```python [Python]
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-token")

# 列出你的 Space
servers = client.list_servers()
print(servers)

# 发送消息
msg = client.send_message("channel-id", "Hello, Shadow!")
```

:::
