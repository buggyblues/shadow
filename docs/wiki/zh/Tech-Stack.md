# 技术栈

Shadow 使用的技术和框架完整列表。

## 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| TanStack Router | latest | 类型安全的基于文件路由 |
| TanStack Query | latest | 服务端状态管理 |
| Zustand | latest | 客户端状态管理 |
| Tailwind CSS | 4 | 工具优先的 CSS |
| Rsbuild (Rspack) | latest | 构建工具（基于 Rust，高性能） |
| i18next + react-i18next | latest | 国际化 |
| Socket.IO Client | latest | 实时通信 |
| Lucide React | latest | 图标库 |
| Radix UI | latest | 无障碍 UI 原语 |

## 桌面端

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 36 | 跨平台桌面框架 |
| Electron Forge | 7 | 构建、打包和发布 |
| Rspack | latest | 主进程/预加载脚本打包 |
| Playwright | latest | E2E 测试 |

## 移动端

| 技术 | 版本 | 用途 |
|------|------|------|
| Expo | 54 | React Native 框架 |
| React Native | 0.81 | 跨平台移动 UI |
| Expo Router | 6 | 基于文件的导航 |
| FlashList | 2 | 高性能列表 |

## 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Hono | latest | 轻量级 Web 框架 |
| Drizzle ORM | latest | 类型安全的 SQL ORM |
| Socket.IO | latest | WebSocket 服务器 |
| Awilix | latest | 依赖注入容器 |
| Zod | latest | 运行时数据验证 |
| Pino | latest | 结构化 JSON 日志 |
| bcryptjs | latest | 密码哈希 |
| jsonwebtoken | latest | JWT 认证 |

## 数据库与基础设施

| 技术 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 16 | 主关系数据库 |
| Redis | 7 | 缓存、会话、发布/订阅 |
| MinIO | latest | S3 兼容对象存储 |
| Docker Compose | latest | 容器编排 |

## 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| TypeScript | 5.9 | 静态类型检查 |
| Biome | 2 | 代码检查 + 格式化（替代 ESLint/Prettier） |
| Vitest | 4 | 单元/集成测试 |
| Playwright | latest | E2E 测试（桌面端） |
| pnpm | 10 | 包管理器（工作空间） |
| Husky | latest | Git 钩子 |
| lint-staged | latest | 提交前检查 |
| Commitlint | latest | 规范化提交信息 |

## SDK

| SDK | 语言 | 包名 |
|-----|------|------|
| TypeScript SDK | TypeScript | `@shadowob/sdk` |
| Python SDK | Python | `shadow-sdk` |
| OAuth SDK | TypeScript | `@shadowob/oauth` |
| OpenClaw 插件 | TypeScript | `@shadowob/openclaw-shadowob` |
