# Shadow CLI

Shadow CLI 是 Shadow 服务器的命令行工具，提供完整的 API 访问能力。

## 安装

```bash
npm install -g @shadowob/cli
```

## 快速开始

```bash
# 登录
shadowob auth login --server-url https://shadowob.com --token <your-jwt-token>

# 查看当前用户
shadowob auth whoami

# 列出服务器
shadowob servers list

# 发送消息
shadowob channels send <channel-id> --content "Hello, Shadow!"
```

## 认证

### 登录

```bash
shadowob auth login --server-url <url> --token <token> [--profile <name>]
```

选项：
- `--server-url` (必需): Shadow 服务器地址
- `--token` (必需): JWT 认证令牌
- `--profile`: 配置文件名，默认为 `default`

### 切换配置文件

```bash
shadowob auth switch <profile-name>
```

### 查看当前用户

```bash
shadowob auth whoami [--json]
```

### 列出所有配置

```bash
shadowob auth list [--json]
```

### 退出登录

```bash
shadowob auth logout [--profile <name>]
```

## 服务器管理

### 列出服务器

```bash
shadowob servers list [--json]
```

### 获取服务器详情

```bash
shadowob servers get <server-id> [--json]
```

### 创建服务器

```bash
shadowob servers create --name <name> [--slug <slug>] [--description <desc>] [--json]
```

### 加入服务器

```bash
shadowob servers join <server-id> [--invite-code <code>]
```

### 离开服务器

```bash
shadowob servers leave <server-id>
```

### 发现公开服务器

```bash
shadowob servers discover [--json]
```

## 频道管理

### 列出频道

```bash
shadowob channels list --server-id <server-id> [--json]
```

### 获取频道详情

```bash
shadowob channels get <channel-id> [--json]
```

### 创建频道

```bash
shadowob channels create --server-id <id> --name <name> [--type text|voice] [--json]
```

### 删除频道

```bash
shadowob channels delete <channel-id>
```

### 发送消息

```bash
shadowob channels send <channel-id> --content <text> [--reply-to <id>] [--thread-id <id>] [--json]
```

### 获取消息列表

```bash
shadowob channels messages <channel-id> [--limit <n>] [--cursor <cursor>] [--json]
```

### 编辑消息

```bash
shadowob channels edit <message-id> --content <new-text> [--json]
```

### 删除消息

```bash
shadowob channels delete-message <message-id>
```

### 添加反应

```bash
shadowob channels react <message-id> --emoji <emoji>
```

### 移除反应

```bash
shadowob channels unreact <message-id> --emoji <emoji>
```

## 线程

### 列出线程

```bash
shadowob threads list <channel-id> [--json]
```

### 创建线程

```bash
shadowob threads create <channel-id> --name <name> --parent-message <id> [--json]
```

### 在线程中发送消息

```bash
shadowob threads send <thread-id> --content <text> [--json]
```

## 私信 (DM)

### 列出 DM 频道

```bash
shadowob dms list [--json]
```

### 创建 DM 频道

```bash
shadowob dms create --user-id <user-id> [--json]
```

### 发送 DM

```bash
shadowob dms send <dm-channel-id> --content <text> [--json]
```

### 获取 DM 消息

```bash
shadowob dms messages <dm-channel-id> [--limit <n>] [--json]
```

## Agent 管理

### 列出 Agents

```bash
shadowob agents list [--json]
```

### 创建 Agent

```bash
shadowob agents create --name <name> [--display-name <name>] [--avatar-url <url>] [--json]
```

### 更新 Agent

```bash
shadowob agents update <agent-id> [--name <name>] [--display-name <name>] [--json]
```

### 删除 Agent

```bash
shadowob agents delete <agent-id>
```

### 启动/停止 Agent

```bash
shadowob agents start <agent-id>
shadowob agents stop <agent-id>
```

### 获取 Agent Token

```bash
shadowob agents token <agent-id> [--json]
```

## 实时事件监听

### 监听频道事件

```bash
# 流式模式（实时）
shadowob listen channel <channel-id> --mode stream [--timeout <seconds>] [--count <n>] [--json]

# 轮询模式（获取历史）
shadowob listen channel <channel-id> --mode poll [--last <n>] [--since <duration>] [--json]

# 过滤特定事件
shadowob listen channel <id> --event-type message:new,reaction:add [--json]
```

### 监听 DM 事件

```bash
shadowob listen dm <dm-channel-id> [--timeout <seconds>] [--count <n>] [--json]
```

## 工作区

### 获取工作区信息

```bash
shadowob workspace get <server-id> [--json]
shadowob workspace tree <server-id> [--json]
```

### 文件操作

```bash
# 创建文件
shadowob workspace files create <server-id> --name <name> [--content <text>] [--parent-id <id>] [--json]

# 更新文件
shadowob workspace files update <file-id> [--name <name>] [--content <text>] [--json]

# 删除文件
shadowob workspace files delete <file-id>

# 上传文件
shadowob workspace files upload <server-id> --file <path> [--name <name>] [--parent-id <id>] [--json]

# 下载文件
shadowob workspace files download <file-id> [--output <path>]
```

### 文件夹操作

```bash
# 创建文件夹
shadowob workspace folders create <server-id> --name <name> [--parent-id <id>] [--json]

# 更新文件夹
shadowob workspace folders update <folder-id> --name <name> [--json]

# 删除文件夹
shadowob workspace folders delete <folder-id>
```

## 商店

### 商品管理

```bash
# 列出商品
shadowob shop products list <server-id> [--category-id <id>] [--json]

# 创建商品
shadowob shop products create <server-id> --name <name> --price <n> [--description <desc>] [--category-id <id>] [--stock <n>] [--json]

# 更新商品
shadowob shop products update <product-id> [--name <name>] [--price <n>] [--description <desc>] [--stock <n>] [--json]

# 删除商品
shadowob shop products delete <product-id>
```

### 购物车

```bash
# 查看购物车
shadowob shop cart list <server-id> [--json]

# 添加商品
shadowob shop cart add <server-id> --product-id <id> [--quantity <n>] [--json]

# 更新数量
shadowob shop cart update <item-id> --quantity <n> [--json]

# 移除商品
shadowob shop cart remove <item-id>
```

### 订单

```bash
# 列出订单
shadowob shop orders list [--server-id <id>] [--json]

# 创建订单
shadowob shop orders create <server-id> [--note <text>] [--json]

# 查看订单详情
shadowob shop orders get <order-id> [--json]
```

### 钱包

```bash
# 查看余额
shadowob shop wallet balance [--json]

# 查看交易记录
shadowob shop wallet transactions [--limit <n>] [--json]

# 充值
shadowob shop wallet topup --amount <n> [--json]
```

## 应用

### 列出应用

```bash
shadowob apps list <server-id> [--json]
```

### 创建应用

```bash
shadowob apps create <server-id> --name <name> --type <url|workspace|static> [--source-url <url>] [--description <desc>] [--json]
```

### 从工作区发布

```bash
shadowob apps publish <server-id> --folder-id <id> [--name <name>] [--description <desc>] [--json]
```

### 更新/删除应用

```bash
shadowob apps update <app-id> [--name <name>] [--description <desc>] [--json]
shadowob apps delete <app-id>
```

## 好友

### 列出好友

```bash
shadowob friends list [--json]
```

### 好友请求

```bash
# 查看请求
shadowob friends requests [--incoming] [--outgoing] [--json]

# 发送请求
shadowob friends add <user-id> [--message <text>] [--json]

# 接受/拒绝请求
shadowob friends accept <user-id> [--json]
shadowob friends reject <user-id>
```

### 管理好友

```bash
# 移除好友
shadowob friends remove <user-id>

# 屏蔽/解除屏蔽
shadowob friends block <user-id>
shadowob friends unblock <user-id>

# 查看屏蔽列表
shadowob friends blocked [--json]
```

## 通知

### 列出通知

```bash
shadowob notifications list [--unread-only] [--limit <n>] [--json]
```

### 管理通知

```bash
# 标记已读
shadowob notifications mark-read <notification-id>
shadowob notifications mark-all-read

# 删除通知
shadowob notifications delete <notification-id>
```

### 通知偏好设置

```bash
# 获取设置
shadowob notifications preferences get [--json]

# 更新设置
shadowob notifications preferences update [--email-enabled <bool>] [--push-enabled <bool>] [--mentions-only <bool>] [--json]
```

## 搜索

### 全局搜索

```bash
shadowob search global --query <text> [--server-id <id>] [--channel-id <id>] [--type <type>] [--limit <n>] [--json]
```

### 搜索消息

```bash
shadowob search messages --query <text> [--server-id <id>] [--channel-id <id>] [--author-id <id>] [--after <date>] [--before <date>] [--has-attachments] [--limit <n>] [--json]
```

### 搜索用户

```bash
shadowob search users --query <text> [--limit <n>] [--json]
```

### 搜索服务器

```bash
shadowob search servers --query <text> [--limit <n>] [--json]
```

## 配置管理

### 显示配置路径

```bash
shadowob config
```

### 验证配置

```bash
shadowob config validate [--json]
```

验证当前配置文件的有效性，检查：
- 配置文件格式是否正确
- 当前 profile 是否存在
- serverUrl 是否有效
- token 是否过期

### 修复配置

```bash
shadowob config fix [--json]
```

自动修复常见问题：
- 移除损坏的 profile
- 清理无效的 token
- 重置当前 profile（如果不存在）

## 健康检查

### Ping 服务器

```bash
shadowob ping [--profile <name>] [--json]
```

测试与 Shadow 服务器的连接，返回：
- 服务器状态
- 响应时间
- 服务器版本

### 详细状态

```bash
shadowob status [--profile <name>] [--json]
```

显示详细状态信息：
- 当前用户信息
- 服务器连接状态
- 已加入的服务器数量
- 未读通知数量

## 输出格式

所有命令支持 `--json` 选项输出 JSON 格式，便于脚本处理：

```bash
# 人类可读格式（默认）
shadowob servers list

# JSON 格式
shadowob servers list --json
```

## 全局选项

- `--profile <name>`: 使用指定配置文件
- `--json`: 输出 JSON 格式

## 环境变量

- `SHADOWOB_TOKEN`: 直接设置认证令牌（覆盖配置文件）
- `SHADOWOB_SERVER_URL`: 直接设置服务器地址

## 配置文件

配置文件存储在 `~/.shadowob/shadowob.config.json`：

```json
{
  "current": "default",
  "profiles": {
    "default": {
      "serverUrl": "https://shadowob.com",
      "token": "eyJ..."
    },
    "work": {
      "serverUrl": "https://work.shadowob.com",
      "token": "eyJ..."
    }
  }
}
```