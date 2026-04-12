# 用户体验与错误处理审查报告

**审查日期**: 2026-04-12
**审查分支**: `review/error-ux`
**审查人**: 小炸 🐱

---

## 📋 总览

对虾豆 (Shadow) 项目的用户交互体验和错误处理机制进行了全面审查。审查范围包括：
- Web 端组件 (`apps/web/src/components/`)
- Web 端页面 (`apps/web/src/pages/`)
- 移动端组件 (`apps/mobile/src/components/`)
- 服务端全局错误处理 (`apps/server/src/app.ts`)

### 评分总结

| 审查维度 | 评分 | 状态 |
|----------|------|------|
| 用户友好错误提示 | ⭐⭐⭐ | 🟡 待改进 |
| 错误码体系 | ⭐⭐ | 🔴 需改进 |
| Retry 策略 | ⭐⭐ | 🔴 需改进 |
| Loading 状态 | ⭐⭐⭐⭐ | 🟢 良好 |
| 空状态处理 | ⭐⭐⭐⭐ | 🟢 良好 |
| 表单验证 | ⭐⭐⭐ | 🟡 待改进 |
| 权限错误处理 | ⭐⭐ | 🔴 需改进 |

---

## 1. 用户友好错误提示 🟡

### 现状

**做得好的地方：**
- `fetchApi` 函数能从响应体中提取 `error`、`detail`、`message` 字段，并提取 Zod 验证错误的 `issues` 拼接成用户可读消息
- 登录/注册页面使用 `Alert` 组件展示错误，视觉清晰
- 错误消息大部分通过 i18n key 国际化

**存在的问题：**

#### 问题 1.1: 服务端 500 错误暴露技术细节

`apps/server/src/app.ts` 中的全局错误处理：

```ts
return c.json(
  {
    ok: false,
    error: status >= 500 ? 'Internal Server Error' : message,
  },
  status as 400,
)
```

- 500+ 错误统一返回 "Internal Server Error"，这是对的 ✅
- 但 4xx 错误直接返回 `error.message`，这取决于 handler 中 `throw new Error(...)` 的内容
- **注意**：`middleware/error.middleware.ts` 文件存在但未被使用，实际生效的是 `app.ts` 中的 `app.onError`，两套逻辑不一致

#### 问题 1.2: 前端直接暴露服务端错误消息给 Toast

多个页面直接 `showToast(err.message, 'error')`：
- `contract-detail.tsx`: `onError: (err: Error) => showToast(err.message, 'error')`
- `friends.tsx`: `onError: (err: Error) => showToast(err.message, 'error')`
- `marketplace-detail.tsx`: `showToast(err.message, 'error')`

服务端返回的错误消息如 "Not a member of this server" 或 "Agent not found" 虽然可读，但：
- 没有经过 i18n 翻译
- 英文错误直接展示给中文用户

#### 问题 1.3: Mobile 端 Toast 使用 Alert 弹窗

`apps/mobile/src/lib/toast.ts` 使用 `Alert.alert()` 作为 toast 实现：

```ts
export function showToast(message: string, type: ToastType = 'info') {
  Alert.alert(titles[type], message, [{ text: 'OK' }], { cancelable: true })
}
```

这会让用户在每次错误时都看到需要点击 "OK" 的弹窗，体验远不如 Web 端的自动消失 toast。注释中也建议用 `react-native-toast-message` 替代。

### 改进建议

1. **统一错误消息映射**：在前端建立错误消息到 i18n key 的映射表
2. **移动端替换 toast**：使用 `react-native-toast-message` 替代 Alert
3. **清理冗余**：移除未使用的 `middleware/error.middleware.ts`

---

## 2. 错误码体系 🔴

### 现状

**已定义但未使用！**

`apps/server/src/lib/response.ts` 中定义了完整的错误码体系：

```ts
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_INPUT: 'INVALID_INPUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const
```

同时提供了 `err(c, message, code, status)` 和 `ok(c, data)` 辅助函数。

**但是——没有任何 handler 使用它们！** 搜索整个服务端代码：

```
grep -rn "ErrorCodes\." apps/server/src/handlers/  →  无结果
grep -rn "import.*err\b\|import.*ok\b" apps/server/src/handlers/  →  无结果
```

所有 handler 都使用内联的 `c.json({ ok: false, error: '...' }, status)` 写法。

**影响：**
- 前端无法通过 `code` 字段区分错误类型，只能解析英文错误字符串
- `ApiError` 接口定义了 `code?: ErrorCode` 但实际永远不会返回
- 前端 `fetchApi` 没有利用 `code` 字段做差异化的错误处理

### 改进建议

1. **全面迁移 handler**：将所有 `c.json({ ok: false, error: '...' }, status)` 替换为 `err(c, '...', ErrorCodes.XXX, status)`
2. **前端利用 code**：在 `fetchApi` 或 UI 层根据 `code` 展示对应的 i18n 消息
3. **增加 429 错误码**：文档提到限流但 `ErrorCodes` 中没有 `RATE_LIMITED`

---

## 3. Retry 策略 🔴

### 现状

**React Query 配置：**

```ts
// apps/web/src/lib/query-client.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
```

移动端配置相同 (`apps/mobile/src/lib/query-client.ts`)。

**存在的问题：**

#### 问题 3.1: 固定 retry 次数，无退避策略

- `retry: 1` 对所有 query 统一重试 1 次，不管错误类型
- 没有 `retryDelay` 配置，使用 React Query 默认的线性延迟（1s, 2s, 4s...）
- **401/403/404 等确定性错误也会被重试**，浪费请求

#### 问题 3.2: fetchApi 手动重试 token 刷新

`fetchApi` 中有 401 自动刷新 token 逻辑：

```ts
if (response.status === 401 && !path.endsWith('/auth/login')) {
  if (!isRefreshing) {
    isRefreshing = true
    refreshPromise = refreshAccessToken().finally(...)
  }
  const newToken = await refreshPromise
  // ...
}
```

这段逻辑有几个隐患：
- **模块级变量 `isRefreshing` 和 `refreshPromise` 不是线程安全的**，并发请求可能产生竞态
- 刷新失败后调用 `clearAuthState()` 直接跳转登录页，没有给用户任何提示
- 刷新成功后重新发起原始请求，但如果原始请求有 `body`（POST 请求），`fetch` 的 body stream 已被消费，重试会失败

#### 问题 3.3: 没有网络错误的重试

网络中断（DNS 失败、断网等）时 `fetch` 抛出 TypeError，不会被 `retry: 1` 捕获（React Query 默认不 retry 非 HTTP 错误），也没有自定义的 retry 逻辑。

### 改进建议

1. **精细化 retry 配置**：
   ```ts
   retry: (failureCount, error) => {
     if (error?.status && [400, 401, 403, 404].includes(error.status)) return false
     return failureCount < 2
   },
   retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000), // 指数退避
   ```

2. **修复 fetchApi 重试 body 问题**：在重试前重新序列化 body

3. **Token 刷新提示**：刷新失败后先 toast 提示 "登录已过期，请重新登录"，再跳转

---

## 4. Loading 状态 🟢

### 现状

**做得好的地方：**

#### Web 端
- 大部分页面使用 `isLoading` 或 `isPending` 展示 loading
- 按钮在 mutation 期间显示 `loading={isPending}` 并 disable
- 有 `t('common.loading')` 国际化 loading 文本
- `settings/developer.tsx`: 列表加载时显示 "加载中..."
- `settings/wallet.tsx`: 使用 `RefreshCw` 旋转图标

#### 移动端
- 有专门的 `LoadingScreen` 组件，支持自定义 message
- 评论提交按钮显示 "Sending..." 文本
- 注册/登录按钮有 loading 状态

**存在的问题：**

#### 问题 4.1: 部分页面未处理 query error 状态

很多页面只检查 `isLoading`，没有处理 `isError`：

```ts
// apps/web/src/pages/apps.tsx
const { data: server } = useQuery({...})
const isServerLoading = !server  // 如果查询失败了，server 也是 undefined
return isServerLoading ? (...) : (<AppPage />)
```

查询失败时也会显示 loading spinner，用户看到的是一个永远转不停的圈。

#### 问题 4.2: 缺少全局 loading 指示器

没有 Suspense fallback 或全局 loading 指示器。当多个请求同时进行时，用户看不到整体进度。

#### 问题 4.3: Skeleton 缺失

当前 loading 状态用的是 spinner 或纯文本，没有使用骨架屏 (Skeleton)，视觉体验不够好。

### 改进建议

1. **所有 useQuery 都应该处理 isError**：显示错误状态 + 重试按钮
2. **引入 Skeleton 组件**：替换纯 spinner，改善感知性能
3. **Suspense fallback**：在路由级别设置统一的 loading fallback

---

## 5. 空状态处理 🟢

### 现状

**做得很好！** 空状态是项目中做得最好的部分之一。

#### Web 端 (`apps/web/src/components/common/empty-state.tsx`)

- 有完整的 `EmptyState` 组件，支持 icon、title、description、主/次要操作
- 提供了 5 个预定义空状态：
  - `NoFriends` — 👋 还没有好友
  - `NoServers` — 🏠 还没有加入任何服务器
  - `NoChannels` — 💬 还没有频道
  - `NoMessages` — ✨ 欢迎来到 #频道
  - `NoNotifications` — 🔔 没有新通知
  - `NoSearchResults` — 🔍 没有找到结果

#### 移动端 (`apps/mobile/src/components/common/empty-state.tsx`)

- 功能类似但更简洁，支持 icon、title、description、action

#### UI 组件库 (`packages/ui/src/components/ui/empty-state.tsx`)

- 有统一的 EmptyState 组件，带虚线边框和模糊背景效果

#### 实际使用

- `wallet.tsx`：交易列表为空时显示自定义空状态 ✅
- `app-page.tsx` (mobile)：使用 EmptyState 展示 "No Apps" ✅

**存在的问题：**

#### 问题 5.1: 移动端 EmptyState 缺少预定义场景

Web 端有 6 个预定义空状态组件，移动端只有通用的 EmptyState，需要每次手动构建。

#### 问题 5.2: 网络错误状态缺失

EmptyState 组件没有网络错误场景。当 API 请求失败时，页面要么显示空白，要么显示 spinner（因为 `isError` 未被处理），没有一个 "网络错误，点击重试" 的空状态。

### 改进建议

1. **为移动端添加预定义空状态**：与 Web 端保持一致
2. **新增 ErrorState 组件**：专门处理网络错误场景，带重试按钮
3. **i18n 空状态文案**：移动端的部分 EmptyState 文案还是硬编码英文

---

## 6. 表单验证 🟡

### 现状

#### 服务端验证 ✅

- 使用 `@hono/zod-validator` 进行请求体验证
- 定义了 `loginSchema`、`registerSchema`、`changePasswordSchema`
- Zod 验证错误通过 `fetchApi` 的 issues 提取逻辑转化为可读消息

#### 前端验证

**做得好的地方 (`settings/account.tsx`)：**
- 密码长度验证（<8 字符提示）
- 密码一致性验证
- 表单字段有 `error` prop 展示错误信息
- 错误字段用 `border-danger` 样式标记
- 提交按钮在验证不通过时 disabled

**存在的问题：**

#### 问题 6.1: 验证逻辑分散

- `account.tsx` 有客户端验证 ✅
- `login.tsx` 和 `register.tsx` 完全依赖服务端验证 ❌，只做 `required` 和 `minLength` HTML 原生约束
- 用户名格式、邮箱格式等没有客户端验证
- 重复密码等通用验证没有复用

#### 问题 6.2: 注册页无密码强度提示

注册表单有 `minLength={8}` 但：
- 没有实时密码强度指示
- 没有说明密码要求（大小写、数字等）
- 用户提交后才通过服务端错误得知问题

#### 问题 6.3: 表单错误统一走 Alert

登录/注册的错误统一用 `Alert` 组件在表单顶部展示：
- 如果有多个字段错误，只会显示服务端返回的第一个错误
- 无法定位到具体哪个字段有问题

### 改进建议

1. **提取验证 Schema 复用**：从服务端 Zod schema 生成前端验证逻辑
2. **注册页增加密码强度指示器**
3. **服务端验证错误映射到表单字段**：将 Zod issues 映射到具体输入框

---

## 7. 权限错误处理 🔴

### 现状

#### 服务端

`auth.middleware.ts`:
```ts
return c.json({ ok: false, error: 'Unauthorized: Missing or invalid token' }, 401)
return c.json({ ok: false, error: 'Unauthorized: Invalid or expired token' }, 401)
```

`permission.middleware.ts`:
```ts
return c.json({ ok: false, error: 'Not a member of this server' }, 403)
return c.json({ ok: false, error: `Requires ${requiredRole} role or higher` }, 403)
```

`oauth-auth.middleware.ts`:
```ts
return c.json({ ok: false, error: 'insufficient_scope', code: 'FORBIDDEN', required: requiredScopes }, 403)
```

**做得好的地方：**
- OAuth 中间件返回了 `code: 'FORBIDDEN'` 和 `required: requiredScopes`，这是唯一正确使用错误码的地方 ✅
- `invite.tsx` 页面正确处理了 401（跳转登录）和 409（已是成员）

#### 前端

`fetchApi` 的 401 自动刷新 token 逻辑 ✅，但：

#### 问题 7.1: 403 权限不足无前端处理

- `fetchApi` 只处理 401，不处理 403
- 403 错误直接作为普通 Error 抛出
- 用户看到的是 "Not a member of this server" 或 "Requires admin role or higher"
- **没有引导用户去申请权限或联系管理员**

#### 问题 7.2: 权限错误没有差异化 UI

不同级别的权限错误应该有不同的处理：
- 未登录 (401) → 引导登录 ✅ (部分实现)
- 不是服务器成员 (403) → 引导申请加入或离开
- 权限不够 (403) → 提示联系管理员
- Token 过期 → 自动刷新 (已实现 ✅)

当前全部混为一谈，用户无法区分。

#### 问题 7.3: 无全局 403 拦截

没有一个全局拦截器统一处理 403 错误。每个页面需要自己处理，容易遗漏。

### 改进建议

1. **fetchApi 增加 403 处理**：根据错误码/消息类型展示不同提示
2. **全局权限错误拦截器**：在 API 层统一处理 403
3. **权限引导 UI**：权限不足时显示 "需要 XX 权限，请联系管理员" 并提供联系方式

---

## 🔥 高优先级问题汇总

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | `ErrorCodes` 体系定义但未使用 | 前端无法区分错误类型 | 🔴 P0 |
| 2 | 403 权限错误无前端差异化处理 | 用户看到技术错误，不知所措 | 🔴 P0 |
| 3 | fetchApi 重试 POST 请求 body 已消费 | 刷新 token 后 POST 重试会静默失败 | 🔴 P0 |
| 4 | 查询失败 (`isError`) 未处理，显示 spinner | 错误时用户看到无限 loading | 🟡 P1 |
| 5 | 移动端使用 Alert 代替 toast | 每次错误需点击 OK，体验差 | 🟡 P1 |
| 6 | 无网络错误空状态 | 断网时页面空白或卡 loading | 🟡 P1 |
| 7 | 表单验证逻辑分散，不可复用 | 维护成本高，容易遗漏 | 🟢 P2 |

---

## 📝 建议的后续行动

### Phase 1: 修复关键问题
1. 全面迁移 handlers 使用 `err()` / `ErrorCodes`
2. 修复 `fetchApi` POST 重试 body 问题
3. 所有 `useQuery` 增加 `isError` 处理

### Phase 2: 改善用户体验
4. 增加全局 403 拦截器
5. 添加网络错误 EmptyState 组件
6. 移动端替换为 react-native-toast-message

### Phase 3: 精细化
7. 提取可复用的表单验证逻辑
8. 精细化 React Query retry 策略（指数退避 + 错误类型过滤）
9. 引入 Skeleton 组件
