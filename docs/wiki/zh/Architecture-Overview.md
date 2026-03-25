# 架构概览

Shadow 是一个 monorepo，包含 **5 个可部署应用** 和 **6 个共享包**，后端由 PostgreSQL、Redis 和 MinIO 支撑。

## 系统架构

```
                         ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                         │   Web 应用    │    │   管理后台    │    │   移动端应用  │
                         │  (React SPA) │    │ (React SPA)  │    │   (Expo)     │
                         │  :3000       │    │  :3001       │    │              │
                         └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
                                │ HTTP / WS         │ HTTP              │ HTTP / WS
                                └───────────────────┼──────────────────┘
                                                    ▼
┌─────────────┐        ┌───────────────────────────────────────────────────────────┐
│  OpenClaw   │───────▶│                  API 服务 (Hono)                          │
│  智能体     │  WS    │                     :3002                                 │
│  (MCP)      │        │                                                           │
└─────────────┘        │  ┌─────────┐    ┌──────────┐    ┌──────┐                  │
                       │  │ Handler │ →  │ Service  │ →  │ DAO  │                  │
                       │  └─────────┘    └──────────┘    └──┬───┘                  │
┌─────────────┐        │  ┌──────────────┐  ┌────────┐     │                       │
│   桌面端    │───────▶│  │ Socket.IO WS │  │Awilix  │     │                       │
│ (Electron)  │  WS    │  │   网关       │  │  DI    │     │                       │
└─────────────┘        │  └──────────────┘  └────────┘     │                       │
                       └───────────────────────────────────┼───────────────────────┘
                                                           │
                                  ┌────────────────────────┼────────────────┐
                                  ▼                        ▼                ▼
                           ┌───────────┐           ┌───────────┐    ┌───────────┐
                           │PostgreSQL │           │   Redis   │    │   MinIO   │
                           │  (数据)    │           │  (缓存)   │    │   (S3)    │
                           └───────────┘           └───────────┘    └───────────┘
```

## 设计原则

1. **分层架构** — Handler → Service → DAO → 数据库（严格的依赖方向）
2. **依赖注入** — Awilix 容器管理所有单例；不直接导入服务
3. **端到端类型安全** — 前后端通过 `@shadowob/shared` 共享类型
4. **Monorepo 工作空间包** — `apps/*` 为可部署应用，`packages/*` 为共享代码

## 应用列表

| 应用 | 路径 | 描述 | 技术 |
|------|------|------|------|
| **Web** | `apps/web` | React SPA 主应用 | React 19、TanStack Router、Rsbuild |
| **Admin** | `apps/admin` | 管理员控制面板 | React 19、Rsbuild |
| **Server** | `apps/server` | REST API + WebSocket | Hono、Drizzle、Socket.IO |
| **Desktop** | `apps/desktop` | 原生桌面客户端 | Electron 36、Electron Forge |
| **Mobile** | `apps/mobile` | iOS & Android 应用 | Expo 54、React Native |

## 共享包

| 包 | 路径 | 描述 |
|----|------|------|
| `@shadowob/shared` | `packages/shared` | 所有应用共享的类型、常量和工具函数 |
| `@shadowob/ui` | `packages/ui` | 可复用 UI 组件库（基于 Radix） |
| `@shadowob/sdk` | `packages/sdk` | 类型化 REST 客户端 + Socket.IO 事件监听 |
| `@shadowob/openclaw-shadowob` | `packages/openclaw-shadowob` | OpenClaw 智能体频道插件 |
| `@shadowob/oauth` | `packages/oauth` | 第三方应用 OAuth SDK |
| `shadow-sdk` (Python) | `packages/sdk-python` | Python 版 Shadow API 客户端 |

## 包依赖关系

```
@shadowob/web       ──→ @shadowob/shared, @shadowob/ui
@shadowob/admin     ──→ @shadowob/shared, @shadowob/ui
@shadowob/server    ──→ @shadowob/shared
@shadowob/desktop   ──→ @shadowob/shared
@shadowob/mobile    ──→ @shadowob/shared
@shadowob/sdk       ──→ @shadowob/shared
@shadowob/openclaw-shadowob  ──→ @shadowob/sdk
@shadowob/ui        ──→ (无内部依赖)
@shadowob/shared    ──→ (无内部依赖)
```

## 后端架构

### 分层设计

```
HTTP 请求
    │
    ▼
┌──────────────────┐
│    中间件         │  ← 认证、CORS、日志、错误处理
├──────────────────┤
│    Handler       │  ← 解析请求，调用 Service，返回响应
├──────────────────┤
│    Service       │  ← 业务逻辑，流程编排
├──────────────────┤
│      DAO         │  ← 数据访问，Drizzle 查询
├──────────────────┤
│    数据库         │  ← PostgreSQL + Redis + MinIO
└──────────────────┘
```

### 核心后端组件

- **Hono** — 轻量级 HTTP 路由框架
- **Socket.IO** — WebSocket 网关（聊天、在线状态、通知）
- **Drizzle ORM** — 类型安全的 SQL ORM，自动迁移
- **Awilix** — 依赖注入容器
- **Zod** — 运行时请求验证
- **Pino** — 结构化 JSON 日志

## 前端架构

### 状态管理

- **TanStack Query** — 服务端状态（API 数据获取、缓存、失效）
- **Zustand** — 客户端状态（认证、UI 偏好）

### 路由

- **TanStack Router** — 类型安全的基于文件路由（web/desktop）
- **Expo Router** — 基于文件路由（mobile）

### 样式

- **Tailwind CSS v4** — 工具优先的 CSS（web/desktop）
- **React Native StyleSheet** — 平台原生样式（mobile）

## 数据流：实时消息

```
用户输入消息
    │
    ▼
客户端发送 HTTP POST /api/channels/:id/messages
    │
    ▼
服务端验证 → 存入 PostgreSQL
    │
    ▼
服务端通过 Socket.IO 广播 (channel:message)
    │
    ▼
频道内所有已连接客户端收到消息
    │
    ▼
UI 通过 TanStack Query 失效机制响应式更新
```

## 延伸阅读

- [技术栈](Tech-Stack.md) — 详细技术选型
- [数据库设计](Database-Schema.md) — 表定义
- [API 参考](API-Reference.md) — 接口文档
