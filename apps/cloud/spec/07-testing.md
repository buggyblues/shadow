# Shadow Cloud — 测试策略规范

> **Spec:** 07-testing
> **Version:** 3.0-draft
> **Date:** 2026-04-10

---

## 1. 核心原则

**不使用 Mock 测试部署流程。** 所有涉及容器、K8s、进程的测试必须在真实环境中运行。

### 理由

- Mock 无法验证用户的真实体验路径
- 容器启动、配置挂载、健康检查只有真实环境才能暴露问题
- Mock 层本身成为维护负担，给出虚假安全感

### 什么可以用 vitest 单元测试

只有**纯函数**（无副作用、无外部依赖）:

| 模块 | 测试内容 |
|------|---------|
| schema 验证 | `validateCloudConfig(input)` → 正确/报错 |
| deep merge | `deepMerge(a, b)` → 合并结果 |
| extends 展开 | `expandExtends(config)` → 展开后的配置 |
| 模板变量解析 | `resolveTemplateString('${env:X}')` → 替换结果 |
| GitAgent YAML 解析 | `parseAgentYaml(content)` → 结构体 |
| 清单生成 | `buildManifests(config)` → K8s YAML 结构 |

### 什么必须用真实环境

| 场景 | 为什么不能 Mock |
|------|----------------|
| 容器启动 | 镜像构建是否成功、entrypoint 是否正确、路径是否存在 |
| K8s 部署 | RBAC 权限、资源配额、ConfigMap 挂载、Secret 注入 |
| health check | 端口绑定、进程存活、OpenClaw gateway 初始化 |
| 日志聚合 | kubectl logs 的输出格式、日志脱敏是否生效 |
| 服务发现 | K8s Service DNS 解析、端口映射 |

---

## 2. 分层测试架构

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Dashboard E2E (Playwright)            │
│  前提: Layer 2 通过                              │
│  验证: 浏览器 → 模板 → 部署 → 状态查看           │
├─────────────────────────────────────────────────┤
│  Layer 2: Server API 集成测试                    │
│  前提: Layer 1 通过                              │
│  验证: HTTP → /api/deploy → SSE → 部署成功      │
├─────────────────────────────────────────────────┤
│  Layer 1: CLI E2E (真实 kind 集群)              │
│  前提: Layer 0 通过                              │
│  验证: init → validate → up → status → down     │
├─────────────────────────────────────────────────┤
│  Layer 0: 容器运行时验证 (Docker)               │
│  前提: 无                                       │
│  验证: docker run → curl /health → 200          │
└─────────────────────────────────────────────────┘
```

### 前进规则

- Layer 0 失败 → 不运行 Layer 1（容器都跑不起来，部署必然失败）
- Layer 1 失败 → 不运行 Layer 2（集群不可用，API 无法操作）
- Layer 2 失败 → 不运行 Layer 3（API 不通，Dashboard 无数据）

---

## 3. Layer 0: 容器运行时验证

### 3.1 目标

验证每种 Agent 镜像可以成功构建、启动、通过健康检查。

### 3.2 测试脚本

```bash
#!/bin/bash
# __tests__/layer0/test-openclaw-runner.sh
set -euo pipefail

IMAGE="shadowob-cloud/openclaw-runner:test"

# 构建
docker build -t "$IMAGE" images/openclaw-runner/

# 启动（最小配置）
CONTAINER_ID=$(docker run -d \
  -e SHADOWOB_CLOUD_CONFIG='{"agents":{"defaults":{"model":{"provider":"test"}}}}' \
  -p 3100:3100 \
  "$IMAGE")

# 等待健康检查
for i in $(seq 1 30); do
  if curl -sf http://localhost:3100/health > /dev/null 2>&1; then
    echo "✓ Health check passed after ${i}s"
    docker stop "$CONTAINER_ID" && docker rm "$CONTAINER_ID"
    exit 0
  fi
  sleep 1
done

echo "✗ Health check failed after 30s"
docker logs "$CONTAINER_ID"
docker stop "$CONTAINER_ID" && docker rm "$CONTAINER_ID"
exit 1
```

### 3.3 验证项

| 镜像 | 检查项 |
|------|--------|
| openclaw-runner | 构建成功、`/health` → 200、OpenClaw gateway 进程存活 |
| claude-runner | 构建成功、`/health` → 200、ACPX 插件初始化、信号处理 (SIGTERM graceful shutdown) |

### 3.4 安全验证

```bash
# 验证容器以非 root 运行
docker exec "$CONTAINER_ID" whoami  # 不应该是 root

# 验证 rootfs 只读
docker exec "$CONTAINER_ID" touch /test 2>&1 | grep -q "Read-only"

# 验证日志不泄露密钥
docker logs "$CONTAINER_ID" | grep -qv "sk-ant-"
```

---

## 4. Layer 1: CLI E2E (真实集群)

### 4.1 环境搭建

```bash
# CI 或本地: 用 kind 创建临时 K8s 集群
kind create cluster --name shadowob-cloud-test --wait 60s

# 加载本地构建的镜像到 kind
kind load docker-image shadowob-cloud/openclaw-runner:test \
  --name shadowob-cloud-test
```

### 4.2 测试流程

```typescript
// tests/layer1/cli-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'

const CLI = 'node dist/index.js'

describe('Layer 1: CLI → 真实 K8s 集群', () => {
  beforeAll(() => {
    // 确认 kind 集群可用
    execSync('kubectl cluster-info --context kind-shadowob-cloud-test')
  })

  afterAll(() => {
    // 清理
    execSync(`${CLI} down --yes --context kind-shadowob-cloud-test`, {
      stdio: 'pipe',
    })
  })

  it('init 生成有效配置', () => {
    execSync(`${CLI} init --template shadowob-cloud --no-interactive --output /tmp/test-config.json`)
    const result = execSync(`${CLI} validate -f /tmp/test-config.json`, {
      encoding: 'utf-8',
    })
    expect(result).toContain('valid')
  })

  it('up 部署到真实集群', () => {
    execSync(
      `${CLI} up -f /tmp/test-config.json --context kind-shadowob-cloud-test --yes`,
      { timeout: 120_000 }
    )
  })

  it('status 显示 agent Ready', () => {
    const output = execSync(
      `${CLI} status --context kind-shadowob-cloud-test`,
      { encoding: 'utf-8' }
    )
    expect(output).toContain('Ready')
  })

  it('logs 可以获取 agent 日志', () => {
    const output = execSync(
      `${CLI} logs phantom-core --context kind-shadowob-cloud-test --tail 5`,
      { encoding: 'utf-8' }
    )
    expect(output.length).toBeGreaterThan(0)
  })

  it('down 清理所有资源', () => {
    execSync(`${CLI} down --yes --context kind-shadowob-cloud-test`)
    const output = execSync(
      'kubectl get pods -n shadowob-cloud --context kind-shadowob-cloud-test',
      { encoding: 'utf-8', stdio: 'pipe' }
    ).catch(() => '') // namespace 可能已删除
    expect(output).not.toContain('phantom-core')
  })
})
```

### 4.3 密钥安全测试

```typescript
it('validate 拒绝明文 API Key', () => {
  const config = {
    providers: [{ id: 'test', api: 'openai-completions', apiKey: 'sk-ant-real-key' }],
    agents: [{ id: 'test', model: { provider: 'test', name: 'test' } }]
  }
  writeFileSync('/tmp/insecure-config.json', JSON.stringify(config))
  expect(() => {
    execSync(`${CLI} validate -f /tmp/insecure-config.json`)
  }).toThrow(/inline.*key/i)
})

it('日志不泄露密钥', () => {
  const output = execSync(
    `${CLI} up -f /tmp/test-config.json --yes 2>&1`,
    { encoding: 'utf-8' }
  )
  expect(output).not.toMatch(/sk-ant-|sk-proj-|key-/)
})
```

---

## 5. Layer 2: Server API 集成测试

### 5.1 前提

Layer 1 测试通过（集群可用）。

### 5.2 测试流程

```typescript
// tests/layer2/api-integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'

let serverProcess: ChildProcess

describe('Layer 2: Server API → 真实集群', () => {
  beforeAll(async () => {
    // 启动 serve
    serverProcess = spawn('node', ['dist/index.js', 'serve', '--port', '3004'], {
      env: { ...process.env, KUBECONTEXT: 'kind-shadowob-cloud-test' },
    })
    // 等待 API ready
    await waitForPort(3004, 10_000)
  })

  afterAll(() => {
    serverProcess.kill('SIGTERM')
  })

  it('GET /api/templates 返回模板列表', async () => {
    const res = await fetch('http://localhost:3004/api/templates')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.templates.length).toBeGreaterThan(0)
  })

  it('POST /api/deploy 返回 SSE 流并完成部署', async () => {
    const template = await fetch('http://localhost:3004/api/templates/shadowob-cloud')
      .then(r => r.json())

    const res = await fetch('http://localhost:3004/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: template.content }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    // 消费 SSE 直到 complete 事件
    const events = await consumeSSE(res.body)
    const complete = events.find(e => e.event === 'complete')
    expect(complete?.data.success).toBe(true)
  })

  it('GET /api/deployments 返回部署状态', async () => {
    const res = await fetch('http://localhost:3004/api/deployments')
    const data = await res.json()
    expect(data.deployments.length).toBeGreaterThan(0)
    expect(data.deployments[0].ready).toMatch(/\d+\/\d+/)
  })
})
```

---

## 6. Layer 3: Dashboard E2E

### 6.1 Playwright 配置

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3004',
  },
  webServer: {
    command: 'node dist/index.js serve --port 3004',
    port: 3004,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
```

### 6.2 测试用例

```typescript
// e2e/dashboard.spec.ts
test('完整用户旅程: 查看模板 → 部署 → 查看状态', async ({ page }) => {
  // 进入 Templates 页面
  await page.goto('/templates')
  await expect(page.getByText('shadowob-cloud')).toBeVisible()

  // 点击部署
  await page.getByRole('button', { name: /deploy/i }).first().click()

  // 等待 SSE 日志流完成
  await expect(page.getByText(/complete|success/i)).toBeVisible({ timeout: 120_000 })

  // 跳转到 Overview 查看部署状态
  await page.goto('/')
  await expect(page.getByText(/ready/i)).toBeVisible()
})

test('Settings 页面可配置 Provider', async ({ page }) => {
  await page.goto('/settings')
  await page.getByPlaceholder(/api key/i).fill('sk-test-xxx')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText(/saved/i)).toBeVisible()
})
```

---

## 7. 单元测试 (纯函数)

### 7.1 配置: vitest.config.ts

```typescript
export default {
  test: {
    include: ['__tests__/**/*.test.ts'],
    exclude: ['__tests__/e2e/**', '__tests__/layer*/**'],
    environment: 'node',
    timeout: 5_000,
  }
}
```

### 7.2 覆盖范围

| 模块 | 测试文件 | 关键场景 |
|------|----------|----------|
| **parser** | `parser.test.ts` | parseConfigFile, expandExtends, resolveConfig, buildOpenClawConfig, deepMerge |
| **schema** | `schema.test.ts` | typia validate 所有字段, 边界值, 错误消息 |
| **template** | `template.test.ts` | `${env:VAR}`, `${secret:...}`, `${file:...}`, dryRun 模式 |
| **gitagent** | `gitagent.test.ts` ⚠ 缺 | parseYaml, readGitAgentDir, enrichAgent, buildSystemPromptFromGitAgent |
| **infra** | `infra.test.ts` ⚠ 缺 | buildManifests 输出结构, 标签/注解/资源限制 |
| **security** | `security.test.ts` ⚠ 需新增 | 明文 Key 检测、日志脱敏正则、Secret 引用验证 |

### 7.3 validate dryRun 模式 (P0-3)

```typescript
describe('template dryRun', () => {
  it('保留未解析的变量而非 throw', () => {
    const result = resolveTemplateString('${env:MISSING}', {}, { dryRun: true })
    expect(result).toBe('${env:MISSING}')
  })

  it('仍然解析存在的变量', () => {
    process.env.PRESENT = 'hello'
    const result = resolveTemplateString('${env:PRESENT}', {}, { dryRun: true })
    expect(result).toBe('hello')
  })
})
```

---

## 8. CI 配置

### 8.1 Pipeline

```yaml
# .github/workflows/cloud-tests.yml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install && pnpm --filter @aspect/cloud build
      - run: pnpm --filter @aspect/cloud test
    # 纯函数单元测试，无外部依赖

  layer0:
    runs-on: ubuntu-latest
    needs: [unit]
    steps:
      - uses: actions/checkout@v4
      - run: bash __tests__/layer0/test-openclaw-runner.sh
      - run: bash __tests__/layer0/test-claude-runner.sh
    # 真实 Docker 构建 + 启动 + health check

  layer1:
    runs-on: ubuntu-latest
    needs: [layer0]
    steps:
      - uses: actions/checkout@v4
      - uses: helm/kind-action@v1
        with:
          cluster_name: shadowob-cloud-test
      - run: |
          kind load docker-image shadowob-cloud/openclaw-runner:test
          pnpm --filter @aspect/cloud test:layer1
    # 真实 kind 集群 + CLI E2E

  layer2:
    runs-on: ubuntu-latest
    needs: [layer1]
    steps:
      - uses: actions/checkout@v4
      - uses: helm/kind-action@v1
        with:
          cluster_name: shadowob-cloud-test
      - run: pnpm --filter @aspect/cloud test:layer2
    # 真实 Server API + HTTP 请求

  layer3:
    runs-on: ubuntu-latest
    needs: [layer2]
    steps:
      - uses: actions/checkout@v4
      - uses: helm/kind-action@v1
        with:
          cluster_name: shadowob-cloud-test
      - run: pnpm --filter @aspect/cloud test:layer3
    # Playwright Dashboard E2E
```

### 8.2 本地开发

```bash
# 跑纯函数单元测试（秒级）
pnpm test

# 跑 Layer 0（需要 Docker）
bash __tests__/layer0/test-openclaw-runner.sh

# 跑完整 E2E（需要 Docker + kind）
pnpm test:layer1
pnpm test:layer2
pnpm test:layer3
```
