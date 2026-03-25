# Monorepo 结构

Shadow 使用 **pnpm workspace** monorepo。所有应用和包都在同一个仓库中。

## 顶层布局

```
shadow/
├── apps/                    # 可部署应用
│   ├── web/                 # React SPA 主应用 (Rsbuild)
│   ├── admin/               # 管理员控制面板 (Rsbuild)
│   ├── server/              # Hono API 服务 + Socket.IO
│   ├── desktop/             # Electron 桌面客户端
│   └── mobile/              # Expo / React Native 移动应用
├── packages/                # 共享库
│   ├── shared/              # @shadowob/shared — 类型、常量、工具
│   ├── ui/                  # @shadowob/ui — 可复用 UI 组件
│   ├── sdk/                 # @shadowob/sdk — 类型化 REST + Socket.IO 客户端
│   ├── sdk-python/          # shadow-sdk — Python 客户端
│   ├── openclaw/            # @shadowob/openclaw-shadowob — AI 智能体插件
│   └── oauth/               # @shadowob/oauth — OAuth SDK
├── docs/                    # 文档
│   ├── ARCHITECTURE.md      # 详细架构文档
│   ├── wiki/                # Wiki 文档（en/zh）
│   └── development/         # 开发指南
├── scripts/                 # CI/CD 和构建辅助脚本
├── website/                 # 文档网站 (RSPress)
├── docker-compose.yml       # 基础设施编排
├── biome.json               # 代码检查和格式化配置
├── vitest.config.ts         # 测试配置
├── tsconfig.json            # 根 TypeScript 配置
└── pnpm-workspace.yaml      # 工作空间包定义
```

## 应用详情

### `apps/web` — Web 应用

面向用户的主 SPA。使用 Rsbuild 实现快速构建和 HMR。

```
apps/web/src/
├── main.tsx              # 入口点 + 路由定义
├── components/           # 按功能组织的 UI 组件
│   ├── channel/          # 频道侧边栏、设置
│   ├── chat/             # 消息列表、输入框、文件预览
│   ├── common/           # 共享组件
│   ├── layout/           # 应用外壳、导航
│   ├── member/           # 成员列表、个人资料
│   └── server/           # 服务器侧边栏、设置
├── pages/                # 路由页面组件
├── stores/               # Zustand 状态仓库 (auth, chat)
├── hooks/                # 自定义 React Hooks
├── lib/                  # 工具函数（API 客户端、socket、i18n）
└── styles/               # 全局 CSS (Tailwind v4)
```

### `apps/server` — API 服务

基于 Hono 的 REST API，配合 Socket.IO WebSocket 网关。

```
apps/server/src/
├── index.ts              # 启动：HTTP + Socket.IO + DI
├── app.ts                # Hono 应用与路由注册
├── container.ts          # Awilix DI 容器配置
├── db/                   # Drizzle 数据库模式 + 迁移
├── dao/                  # 数据访问对象
├── services/             # 业务逻辑层
├── handlers/             # HTTP 路由处理器
├── middleware/            # 认证、错误处理、日志、权限
├── validators/           # Zod 验证模式
├── ws/                   # WebSocket 网关
└── lib/                  # JWT、日志工具
```

### `apps/desktop` — 桌面应用

使用 Rspack（主进程/预加载）和 Rsbuild（渲染进程）的 Electron 应用。

```
apps/desktop/
├── src/
│   ├── main/             # Electron 主进程
│   ├── preload/          # 预加载脚本（上下文桥接）
│   └── renderer/         # React 渲染进程（与 web 共享）
├── scripts/              # 构建、开发、发布、图标生成
├── e2e/                  # Playwright E2E 测试
└── forge.config.ts       # Electron Forge 配置
```

### `apps/mobile` — 移动应用

基于文件路由的 Expo/React Native 应用。

```
apps/mobile/
├── app/                  # Expo Router 基于文件的路由
│   ├── (auth)/           # 登录、注册页面
│   ├── (main)/           # 主应用页面（标签页、聊天、设置）
│   └── _layout.tsx       # 根布局
├── src/
│   ├── components/       # React Native 组件
│   ├── hooks/            # 自定义 Hooks
│   ├── stores/           # Zustand 状态仓库
│   ├── lib/              # API 客户端、socket、工具函数
│   └── i18n/             # 本地化文件
└── assets/               # 图片、字体
```

## 包详情

### `packages/shared`

所有应用共享的 TypeScript 类型、常量和工具函数。

### `packages/ui`

基于 Radix UI 原语和 CVA（Class Variance Authority）构建的可复用 UI 组件库。

### `packages/sdk`

类型化 REST API 客户端和 Socket.IO 实时事件监听器，用于编程访问 Shadow 服务器。

### `packages/sdk-python`

Python SDK，通过 `httpx` 和 `python-socketio` 提供 REST API 访问和 Socket.IO 事件订阅。

### `packages/openclaw-shadowob`

OpenClaw 插件，使 AI 智能体能够监控和参与 Shadow 服务器频道。

### `packages/oauth`

OAuth SDK，供第三方应用作为 OAuth 2.0 提供方与 Shadow 集成。
