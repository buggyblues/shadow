# Shadow Cloud — 架构分层重构

> **Version:** 4.0-draft
> **Date:** 2026-04-11
> **Status:** Implementation

---

## 1. 问题

当前代码将业务逻辑与 CLI/HTTP 接口混杂在一起：

- `cli/up.ts` 包含部署编排逻辑 + Commander 参数解析 + process.exit
- `cli/serve.ts` 把 HTTP 路由、静态文件服务、SSE 流、K8s 查询全部混在 490 行里
- `provisioning/index.ts` 直接使用 `log.*` 输出，无法作为独立 SDK 使用
- 无法在不引入 Commander 依赖的情况下复用配置解析、清单生成、资源供给等核心能力
- 命名 `shadowob-cloud` 过长，用户体验差

## 2. 目标架构

```
src/
├── services/          # 核心服务层 — 可独立作为 SDK 使用
│   ├── container.ts        # IoC 容器 — 所有服务的注册中心
│   ├── config.service.ts   # 配置解析、校验、解析模板、生成 OpenClaw 配置
│   ├── manifest.service.ts # K8s 清单生成（纯数据转换，无 Pulumi 依赖）
│   ├── provision.service.ts# Shadow 资源供给（服务器、频道、Buddy）
│   ├── deploy.service.ts   # 部署编排（provision → resolve → manifest → apply）
│   ├── template.service.ts # 模板发现与读取
│   ├── runtime.service.ts  # 运行时适配器注册 + 查询
│   ├── image.service.ts    # Docker 镜像构建 + 推送
│   └── k8s.service.ts      # K8s 集群交互（deployments, pods, logs）
│
├── interfaces/        # 接口层 — 只做参数解析 + 转发
│   ├── cli/                # CLI 接口（Commander）
│   │   ├── index.ts             # 注册所有命令
│   │   ├── up.command.ts        # shadowob-cloud up
│   │   ├── init.command.ts      # shadowob-cloud init
│   │   ├── validate.command.ts  # shadowob-cloud validate
│   │   ├── generate.command.ts  # shadowob-cloud generate
│   │   ├── provision.command.ts # shadowob-cloud provision
│   │   ├── images.command.ts    # shadowob-cloud images
│   │   ├── serve.command.ts     # shadowob-cloud serve
│   │   ├── dashboard.command.ts # shadowob-cloud dashboard
│   │   ├── doctor.command.ts    # shadowob-cloud doctor
│   │   ├── status.command.ts    # shadowob-cloud status
│   │   ├── logs.command.ts      # shadowob-cloud logs
│   │   ├── down.command.ts      # shadowob-cloud down
│   │   ├── scale.command.ts     # shadowob-cloud scale
│   │   └── build.command.ts     # shadowob-cloud build
│   │
│   └── http/               # HTTP 接口（Node.js HTTP）
│       ├── server.ts            # HTTP 服务器 + 路由
│       ├── routes/
│       │   ├── deployments.ts   # GET /api/deployments, pods, logs
│       │   ├── templates.ts     # GET /api/templates
│       │   ├── deploy.ts        # POST /api/deploy
│       │   └── settings.ts      # GET/PUT /api/settings
│       └── middleware/
│           ├── auth.ts          # Bearer token 认证
│           ├── cors.ts          # CORS 处理
│           └── static.ts        # 静态文件服务
│
├── config/            # 配置相关（schema 定义 + 模板引擎）
│   ├── schema.ts           # TypeScript 接口 + typia 校验
│   ├── template.ts         # ${env:...} / ${secret:...} 模板解析
│   ├── security.ts         # 内联密钥检测
│   └── index.ts            # 公开导出
│
├── infra/             # K8s 资源定义（Pulumi）
│   ├── agent-deployment.ts
│   ├── config-resources.ts
│   ├── shared.ts
│   ├── networking.ts
│   ├── security.ts
│   └── index.ts
│
├── adapters/          # 外部适配器
│   └── gitagent.ts
│
├── runtimes/          # 运行时适配器
│   ├── index.ts
│   ├── loader.ts
│   ├── openclaw.ts
│   ├── claude-code.ts
│   ├── codex.ts
│   └── opencode.ts
│
├── utils/             # 工具函数
│   ├── logger.ts
│   ├── redact.ts
│   ├── state.ts
│   ├── k8s-client.ts
│   └── kind.ts
│
└── index.ts           # 入口：CLI 调用 interfaces/cli/index.ts
```

## 3. IoC 容器设计

```typescript
// services/container.ts
export interface ServiceContainer {
  config: ConfigService
  manifest: ManifestService
  provision: ProvisionService
  deploy: DeployService
  template: TemplateService
  runtime: RuntimeService
  image: ImageService
  k8s: K8sService
}

export function createContainer(overrides?: Partial<ServiceContainer>): ServiceContainer
```

每个 service 通过构造函数接收依赖（constructor injection）:

```typescript
class DeployService {
  constructor(
    private config: ConfigService,
    private provision: ProvisionService,
    private manifest: ManifestService,
  ) {}

  async up(options: DeployOptions): Promise<DeployResult> { ... }
}
```

## 4. 命名变更

| 旧名 | 新名 |
|------|------|
| `shadowob-cloud` (bin) | `shadowob-cloud` |
| `shadowob-cloud.json` (config file) | `shadowob-cloud.json` (同时兼容旧名) |
| `@shadowob/cloud` (package) | `@shadowob/cloud` |
| `.shadowob/` (settings dir) | `.shadowob/` |

## 5. Dashboard 修复

- `dashboard` 命令传给 `serve.parseAsync()` 时，第二个参数 `'dashboard'` 被作为 argument 导致报错
- 在 `dashboard.ts` 里直接构造 `['node', 'serve', ...]` 或改为直接调用 serve 的 action
- dashboard 静态资源已构建在 `dashboard/dist/`，serve 命令会自动挂载

## 6. 实施顺序

1. ✅ 更新 spec
2. 创建 `services/` 目录，提取核心服务
3. 创建 IoC 容器
4. 重写 CLI 命令为薄包装
5. 重写 HTTP 路由为薄包装
6. 重命名 shadowob-cloud → shadowob-cloud
7. 重写 README.md（面向用户）
8. 修复 dashboard 命令
9. 运行测试 + 验证
