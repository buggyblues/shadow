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
- `friends` / `invites` / `notifications`：社交功能
- `agents` / `marketplace`：AI 代理生态
- `workspace` / `apps` / `app` / `shop`：平台业务能力
- `media`：文件上传和下载
- `search`：消息搜索
- `oauth`：OAuth 应用管理（创建、列表、重置密钥、授权管理、撤销）
- `api-tokens`：个人访问令牌管理（创建、列表、删除）
- `discover`：探索热门服务器、频道和租赁
- `profile-comments`：读取和写入主页留言
- `voice-enhance`：AI 语音转录增强
- `cloud`：透传至 Shadow Cloud CLI
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

详见 [平台应用](/zh/platform/platform-apps) 了解构建 OAuth 应用的完整指南。

## Server App 命令

```bash
# 列出服务器已安装 App
shadowob app list --server <server-id-or-slug> --json

# 安装前审核 manifest
shadowob app preview --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json --json

# 安装并授予 Buddy 权限
shadowob app install --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json --json
shadowob app grant demo-desk --server <server-id-or-slug> --buddy <buddy-agent-id> --permissions demo.tickets:write --json

# 发现 Skills 并调用命令
shadowob app discover --server <server-id-or-slug> --json
shadowob app skills demo-desk --server <server-id-or-slug>
shadowob app call demo-desk tickets.create --server <server-id-or-slug> --json-input '{"title":"Example"}' --json
```

Server App 命令调用会通过 CLI 绑定 Shadow OAuth 身份和 Buddy 授权。Buddy 不应该用 curl 直接调用 Server App 命令路由。

## 语音命令

```bash
# 加入语音频道并输出 Agora RTC 连接信息
shadowob voice join <channel-id> --json

# 保持连接并输出语音成员事件
shadowob voice join <channel-id> --watch --json

# 查看状态或离开语音频道
shadowob voice status <channel-id> --json
shadowob voice leave <channel-id>

# 安装隔离的 Chromium 运行时，用于语音桥接测试
shadowob voice browser install --json
shadowob voice browser path --json

# 通过托管浏览器桥接 RTC 媒体
shadowob voice bridge <channel-id> --audio-out ./audio --screen-out ./screens --json

# 录制完整的本地音视频归档
shadowob voice bridge <channel-id> --record-out ./voice-recordings --json

# 加入前按需安装托管浏览器
shadowob voice bridge <channel-id> --install-browser --audio-out ./audio --json

# 从音频文件向语音频道输入语音
shadowob voice bridge <channel-id> --input ./reply.wav --duration 30

# 从外部模型或进程向语音频道输入 raw PCM
model-audio-producer | shadowob voice bridge <channel-id> --stdin-pcm --sample-rate 24000 --channels 1
```

媒体桥接不会在 `npm install` 时安装 Playwright 或下载浏览器。需要测试 Chromium 运行时时，使用 `shadowob voice browser install` 或 `--install-browser` 按需安装，这能绕开 macOS 系统 Chrome profile/keychain 提示。也可以通过 `--browser` / `SHADOWOB_BROWSER` 显式指定浏览器路径。`--record-out` 会把远端音频保存为 WAV，把远端视频/屏幕共享保存为 WebM。它还需要主机环境提供 Agora Web SDK 浏览器包：可以在 CLI 旁边安装 `agora-rtc-sdk-ng`，或通过 `--agora-sdk` / `SHADOWOB_AGORA_WEB_SDK` 指向 `AgoraRTC_N-production.js`。
