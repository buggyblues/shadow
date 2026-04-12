# 🐱 移动端测试审查报告 (Mobile Testing Review)

> 审查日期: 2026-04-12
> 审查人: 小炸 (Mobile 测试审查官)
> 分支: `review/mobile-testing`

---

## 📊 现状概览

| 维度 | 状态 | 说明 |
|------|------|------|
| 测试框架 | ✅ vitest 4.1.0 + jsdom | 配置已就绪 |
| Setup Mock | ✅ 较完善 | react-native/reanimated/expo 模块 mock 齐全 |
| 现有测试 | ⚠️ 仅 1 个 placeholder | `setup.test.ts` 只有 `expect(true).toBe(true)` |
| CI 集成 | ❌ 未包含 | `docker-compose.ci-tests.yml` 未运行 mobile 测试 |
| 组件数量 | 30 个 TSX 文件 | 0 个有测试覆盖 |
| Web 端测试 | ✅ 67 个测试文件 | 有成熟的 `test-helpers.tsx` 模式可参考 |

---

## 1. 现有测试基础 — 如何开始写第一批测试？

### 当前配置评估

`vitest.config.ts` 和 `vitest.setup.ts` 已经搭建好了基本骨架：
- ✅ vitest 4.1.0 + jsdom 环境
- ✅ `@` 路径别名解析
- ✅ v8 覆盖率配置
- ✅ 大量 RN/Expo 模块 mock

### ⚠️ 关键问题：jsdom 环境不完全适合 React Native

当前使用 `jsdom` 环境，但 React Native 的渲染引擎和 DOM 不同。对于简单组件测试没问题，但涉及 RN 特有 API 时可能遇到边界情况。**建议保持现状**（jsdom 是 RN 社区最常用方案），但注意以下限制：
- `react-native` 组件在 jsdom 中渲染为字符串标签
- 布局相关 API（如 `measure`）可能返回不准确值
- 复杂手势/动画测试需要额外处理

### 第一批测试推荐路径（按难度从低到高）

```
Phase 1: 纯逻辑工具函数 (1-2 小时)
  └── 不需要 React 渲染，直接测试函数行为

Phase 2: 简单 UI 组件 (2-3 小时)
  └── EmptyState, PriceDisplay, StatusBadge 等纯展示组件

Phase 3: 带 Store/Hook 的组件 (3-5 小时)
  └── 需要 mock zustand stores 和 react-query

Phase 4: 复杂交互组件 (5-8 小时)
  └── MessageBubble, ChatComposer 等
```

**建议先写 3-5 个简单测试验证整个链路通顺，再扩展到复杂组件。**

---

## 2. 组件测试策略 — 优先级排序

### 🔴 P0 — 核心流程（第一批写）

| 组件 | 测试要点 | 复杂度 |
|------|----------|--------|
| `Avatar` | URI 渲染、fallback initials、getCatAvatarByUserId | ⭐ 低 |
| `EmptyState` | 标题、描述、按钮点击 | ⭐ 低 |
| `SelectionPopup` | emoji 渲染、action 回调、箭头方向 | ⭐ 低 |
| `useDraftStorage` | 存取逻辑、过期检测、防抖保存 | ⭐ 中 |
| `auth.store` | setAuth/logout/loadPersistedToken | ⭐ 中 |
| `chat.store` | 频道/服务器切换状态 | ⭐ 中 |

### 🟡 P1 — 重要功能（第二批）

| 组件 | 测试要点 | 复杂度 |
|------|----------|--------|
| `MessageBubble` | 渲染、长按弹窗、编辑、删除、表情回复 | ⭐⭐⭐ 高 |
| `ChatComposer` | 输入、发送、附件、草稿恢复 | ⭐⭐⭐ 高 |
| `MarkdownRenderer` | 文本解析、@mention 渲染 | ⭐⭐ 中 |
| `ChannelSidebar` | 频道列表渲染、排序 | ⭐⭐ 中 |
| `api.ts` (fetchApi) | 认证头注入、401 刷新、错误处理 | ⭐⭐ 中 |

### 🟢 P2 — 次要组件（后续补充）

| 组件 | 测试要点 | 复杂度 |
|------|----------|--------|
| `EmojiPicker` | 弹出/关闭回调 | ⭐ 低 |
| `StatusBadge` | 在线状态颜色 | ⭐ 低 |
| `ConfirmDialog` | 确认/取消回调 | ⭐ 低 |
| `NotificationBell` | 未读计数显示 | ⭐ 低 |
| 各类 hooks | 各自的核心逻辑 | ⭐⭐ 中 |

---

## 3. Mock 策略 — React Native 特有 Mock 评估

### ✅ 已覆盖（vitest.setup.ts 中已有）

| 模块 | 覆盖度 | 备注 |
|------|--------|------|
| `react-native` | ✅ 良好 | Platform, Dimensions, StyleSheet, Alert, Animated 等 |
| `react-native-reanimated` | ✅ 良好 | useSharedValue, useAnimatedStyle, withTiming 等 |
| `expo-router` | ✅ 良好 | useRouter, usePathname, useLocalSearchParams |
| `expo-secure-store` | ✅ 良好 | getItemAsync, setItemAsync, deleteItemAsync |
| `expo-constants` | ✅ 良好 | expoConfig 基本字段 |
| `expo-font` | ✅ 良好 | loadAsync, isLoaded |
| `expo-device` | ✅ 基本 | OS, deviceName |
| `expo-image-picker` | ✅ 良好 | launchImageLibraryAsync |
| `expo-clipboard` | ✅ 良好 | setStringAsync, getStringAsync |
| `@shopify/flash-list` | ✅ 良好 | FlashList mock 可渲染子元素 |
| `react-native-gesture-handler` | ✅ 良好 | 基本组件 mock |
| `react-native-safe-area-context` | ✅ 良好 | useSafeAreaInsets |

### ⚠️ 需要补充的 Mock

| 模块 | 原因 | 建议 |
|------|------|------|
| `expo-haptics` | MessageBubble 等使用 | 添加 `selectionAsync: vi.fn()` |
| `expo-file-system` | MessageBubble 下载附件 | 添加 `downloadAsync`, `cacheDirectory` |
| `expo-sharing` | 分享文件功能 | 添加 `isAvailableAsync`, `shareAsync` |
| `expo-media-library` | 保存图片功能 | 添加 `requestPermissionsAsync`, `saveToLibraryAsync` |
| `expo-image` | Image 组件 | 添加 mock 避免渲染问题 |
| `expo-asset` | 资源加载 | 如有用到需要 mock |
| `expo-speech-recognition` | 语音输入 | 如有测试语音功能需要 |
| `socket.io-client` | 实时通信 | 需要 mock socket 连接 |
| `react-i18next` | 国际化 | 需要 `useTranslation` mock 返回 t(key) => key |
| `@tanstack/react-query` | 数据获取 | QueryClient mock / renderWithProviders |

### 💡 建议：新增 `test-helpers.ts`

参考 Web 端 `test-helpers.tsx` 模式，创建移动端测试工具：

```typescript
// apps/mobile/__tests__/test-helpers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native' // 或直接用 jsdom 的 render
import type React from 'react'
import { vi } from 'vitest'

export const fetchApiMock = vi.fn()
export const showToastMock = vi.fn()

vi.mock('../src/lib/api', () => ({
  fetchApi: (...args: unknown[]) => fetchApiMock(...args),
  getImageUrl: (path: string | null | undefined) => path ? `https://test.com${path}` : null,
}))

vi.mock('../src/lib/toast', () => ({
  showToast: (...args: unknown[]) => showToastMock(...args),
}))

export function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

export function resetMocks() {
  fetchApiMock.mockReset()
  showToastMock.mockReset()
}
```

---

## 4. E2E 测试可行性

### 方案对比

| 方案 | 优势 | 劣势 | 推荐度 |
|------|------|------|--------|
| **Detox** | RN 原生集成，灰色测试，速度快 | 需要真机/模拟器配置，CI 成本高 | ⭐⭐⭐ 推荐（长期） |
| **Playwright (Expo Web)** | 复用 web 端 Playwright 基础设施 | 测的是 web 构建，不是原生行为 | ⭐⭐ 辅助 |
| **Maestro** | 跨平台 YAML 编写，CI 友好 | 生态较新，社区小 | ⭐⭐ 可考虑 |
| **Appium** | 行业标准 | 配置复杂，速度慢 | ⭐ 不推荐 |

### 建议路线

```
短期（1-2 周）: 先集中写单元测试 + 组件测试，覆盖核心逻辑
中期（1-2 月）: 引入 Detox，覆盖关键 E2E 流程：
  1. 登录/注册流程
  2. 发送消息（文字 + 图片）
  3. 切换频道/服务器
  4. 店铺浏览和购买流程
长期: CI 集成 Detox，自动化 E2E 回归
```

### CI 集成注意

当前 `docker-compose.ci-tests.yml` 未包含 mobile 测试。建议在 CI 中新增步骤：

```yaml
# 在 ci-tests command 中添加
echo "=== Mobile tests ==="
cd apps/mobile
pnpm test
cd ../..
```

---

## 5. API Mock — 如何 Mock API 调用？

### 推荐策略：三层 Mock

```
Layer 1: fetchApi Mock（最简单）
  └── vi.mock 替换 fetchApi 模块，返回预设数据
  └── 适用于组件测试

Layer 2: MSW (Mock Service Worker)
  └── 拦截真实 HTTP 请求
  └── 适用于集成测试 / E2E 测试

Layer 3: Test Server
  └── 复用 CI 的 postgres + server 服务
  └── 适用于真正的集成/E2E 测试
```

### 复用 Web 端 test-helpers 模式

Web 端已通过 `globalThis.__SHADOW_FETCH_API_MOCK__` 实现全局 mock。移动端可以：

1. **直接复制模式**：在 `vitest.setup.ts` 中设置全局 mock 对象
2. **共享包**：在 `packages/shared` 中创建 `test-utils` 供 web + mobile 复用

推荐方案 1（快速落地），后续考虑方案 2（更好维护）。

### fetchApi Mock 示例

```typescript
// 在测试文件中
fetchApiMock.mockResolvedValue({
  id: 'msg-1',
  content: 'Hello!',
  author: { id: 'user-1', displayName: 'Test User' },
  createdAt: '2026-04-12T10:00:00Z',
  attachments: [],
  reactions: [],
})
```

---

## 6. UI 组件测试 — packages/ui 在移动端的使用

### 现状

移动端组件**主要使用 React Native 原生组件**（View, Text, Pressable 等），而非 `packages/ui` 的 web 组件。`packages/ui` 组件主要为 Web 端设计（基于 Radix UI），不直接在 RN 中使用。

### 测试建议

| 场景 | 方法 |
|------|------|
| 移动端自有组件 | 直接测试 RN 组件 |
| 共享逻辑（如 `getCatAvatarByUserId`） | 在 `packages/shared` 中测试 |
| 共享类型（如 `Message` 类型） | 在 `packages/shared` 中测试 |
| 共享工具函数 | 在 `packages/shared` 中测试 |

### 需要关注的共享依赖

- `@shadowob/shared` — `getCatAvatarByUserId` 在 Avatar 组件中使用
- `react-native-enriched-markdown` — MarkdownRenderer 使用
- `rn-emoji-keyboard` — MessageBubble 使用

这些第三方依赖不需要我们写测试，但需要确保 mock 正确。

---

## 7. 测试目录组织 — 建议结构

### 推荐结构

```
apps/mobile/
├── __tests__/
│   ├── test-helpers.tsx          # 测试工具函数（renderWithProviders, mocks）
│   ├── setup.test.ts             # 基础配置验证
│   ├── unit/                     # 纯逻辑测试
│   │   ├── api.test.ts           # fetchApi 逻辑
│   │   ├── use-draft-storage.test.ts
│   │   └── image-url.test.ts     # getImageUrl
│   ├── components/               # 组件测试
│   │   ├── common/
│   │   │   ├── avatar.test.tsx
│   │   │   ├── empty-state.test.tsx
│   │   │   └── price-display.test.tsx
│   │   ├── chat/
│   │   │   ├── selection-popup.test.tsx
│   │   │   ├── message-bubble.test.tsx
│   │   │   └── chat-composer.test.tsx
│   │   └── server/
│   │       └── server-sidebar.test.tsx
│   ├── stores/                   # Store 测试
│   │   ├── auth.store.test.ts
│   │   └── chat.store.test.ts
│   └── hooks/                    # Hook 测试
│       ├── use-draft-storage.test.ts
│       └── use-unread-count.test.ts
├── vitest.config.ts
└── vitest.setup.ts
```

### 当前 vs 推荐

| 当前 | 推荐 |
|------|------|
| `__tests__/setup.test.ts` (仅 1 个) | 按类型/模块分目录 |
| 无测试工具文件 | 新增 `test-helpers.tsx` |
| 无 CI 集成 | 在 CI 中添加 mobile test 步骤 |

### 命名规范

- 组件测试: `component-name.test.tsx`
- 纯逻辑测试: `module-name.test.ts`
- Store 测试: `module-name.store.test.ts`
- Hook 测试: `use-hook-name.test.ts`

---

## 🎯 行动计划

### Phase 1: 基础设施（本周）
1. ✅ 添加缺失的 Expo mocks（haptics, file-system, sharing, media-library）
2. ✅ 创建 `__tests__/test-helpers.tsx`
3. ✅ 写 2-3 个简单组件测试验证链路
4. ✅ 在 CI 中添加 mobile test 步骤

### Phase 2: 核心组件覆盖（1-2 周）
1. 完成所有 P0 组件测试
2. 覆盖 auth.store 和 chat.store
3. 测试 `api.ts` 的 fetchApi 核心逻辑

### Phase 3: 复杂组件 + E2E 规划（2-4 周）
1. MessageBubble 和 ChatComposer 测试
2. 评估并引入 Detox E2E
3. CI 全量集成

### Phase 4: 持续完善
1. 覆盖率目标: 核心组件 > 80%
2. 新增组件默认包含测试
3. 定期审查测试质量和覆盖率

---

## 📋 总结

| 项目 | 状态 | 行动 |
|------|------|------|
| 测试基础设施 | 🟡 基本可用，需补充部分 mocks | 补充缺失 mock + 创建 test-helpers |
| 测试覆盖率 | 🔴 0%（仅 placeholder） | 从 P0 组件开始写第一批测试 |
| CI 集成 | 🔴 未集成 | 在 CI pipeline 中添加 mobile test 步骤 |
| E2E 方案 | ⚪ 未评估 | 短期不引入，先做好单元/组件测试 |
| 目录结构 | 🟡 可接受 | 按推荐结构组织，逐步迁移 |

**最大风险**: 测试为 0 意味着任何重构都无安全保障。建议立即开始写第一批 P0 测试，建立信心后再扩展。
