# Shadow Design System

> **Version**: 3.0 | **Date**: 2024-03-24 | **Status**: Proposal

---

## 1. 品牌定位

**Shadow** — AI 原生的创作者社区平台

**核心价值**:
- AI Agent 作为社区成员
- 创作者变现能力
- 开源、可定制

**Slogan**: Your AI, Your Community, Your World

---

## 2. 设计原则

### 2.1 视觉风格

**现代、克制、精致**

- 留白带来高级感
- 一致的设计语言
- 微妙的层次与深度
- 流畅的动效体验

### 2.2 设计价值观

| 原则 | 说明 |
|------|------|
| 清晰 | 信息层级分明，一眼看到重点 |
| 高效 | 减少认知负担，操作路径最短 |
| 一致 | 相同元素保持相同表现 |
| 包容 | 支持无障碍、多主题、多语言 |

---

## 3. 色彩系统

### 3.1 品牌色

**Indigo 靛蓝** — 智慧、创造、连接

| 名称 | 色值 | 用途 |
|------|------|------|
| Indigo-50 | #EEF2FF | 背景（浅色模式） |
| Indigo-100 | #E0E7FF | 悬停背景 |
| Indigo-200 | #C7D2FE | 边框、分割线 |
| Indigo-300 | #A5B4FC | 图标、次要元素 |
| Indigo-400 | #818CF8 | 交互态 |
| Indigo-500 | #6366F1 | 品牌主色 |
| Indigo-600 | #4F46E5 | 主要按钮 |
| Indigo-700 | #4338CA | 按钮悬停 |
| Indigo-800 | #3730A3 | 按钮按下 |
| Indigo-900 | #312E81 | 文字强调 |

### 3.2 中性色（暗色模式）

| 名称 | 色值 | 用途 |
|------|------|------|
| Black | #000000 | — |
| Gray-950 | #030712 | 最深背景 |
| Gray-900 | #111827 | 页面背景 |
| Gray-800 | #1F2937 | 卡片背景 |
| Gray-700 | #374151 | 边框 |
| Gray-600 | #4B5563 | 分割线 |
| Gray-500 | #6B7280 | 禁用文字 |
| Gray-400 | #9CA3AF | 占位符 |
| Gray-300 | #D1D5DB | 次要文字 |
| Gray-200 | #E5E7EB | 正文文字 |
| Gray-100 | #F3F4F6 | 标题文字 |
| White | #FFFFFF | — |

### 3.3 功能色

| 名称 | 色值 | 用途 |
|------|------|------|
| Green-500 | #22C55E | 成功、在线 |
| Amber-500 | #F59E0B | 警告、离开 |
| Red-500 | #EF4444 | 错误、勿扰 |
| Blue-500 | #3B82F6 | 信息、链接 |

### 3.4 渐变

仅用于特殊场景（品牌展示、英雄区等）：

- **品牌渐变**: `linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)`
- **卡片光泽**: `linear-gradient(135deg, rgba(99,102,241,0.1) 0%, transparent 50%)`

---

## 4. 字体系统

### 4.1 字体族

```
--font-sans: "Inter", -apple-system, "Segoe UI", "PingFang SC", sans-serif
--font-mono: "JetBrains Mono", "SF Mono", monospace
```

### 4.2 字号规范

| 级别 | 尺寸 | 行高 | 字重 | 用途 |
|------|------|------|------|------|
| Display | 48px | 1.1 | 700 | 营销页大标题 |
| H1 | 32px | 1.2 | 600 | 页面标题 |
| H2 | 24px | 1.3 | 600 | 区块标题 |
| H3 | 18px | 1.4 | 600 | 小标题 |
| Body | 15px | 1.6 | 400 | 正文内容 |
| Body-sm | 14px | 1.5 | 400 | 次要内容 |
| Caption | 12px | 1.4 | 500 | 标签、辅助信息 |
| Overline | 11px | 1.4 | 600 | 分类标题（大写） |

---

## 5. 间距与圆角

### 5.1 间距

基于 4px 基础单位：

| Token | 值 | 用途 |
|-------|-----|------|
| space-1 | 4px | 图标与文字间距 |
| space-2 | 8px | 紧凑元素间距 |
| space-3 | 12px | 默认元素间距 |
| space-4 | 16px | 组件内边距 |
| space-5 | 20px | 卡片内边距 |
| space-6 | 24px | 区块间距 |
| space-8 | 32px | 大区块间距 |
| space-10 | 40px | 章节间距 |
| space-12 | 48px | 页面边距 |

### 5.2 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| radius-sm | 4px | 标签、小按钮 |
| radius-md | 8px | 按钮、输入框 |
| radius-lg | 12px | 卡片、弹窗 |
| radius-xl | 16px | 大卡片、抽屉 |
| radius-2xl | 24px | 模态框 |
| radius-full | 9999px | 头像、徽章 |

---

## 6. 阴影与层次

### 6.1 阴影

暗色模式下使用带色彩倾向的阴影：

| Token | 值 | 用途 |
|-------|-----|------|
| shadow-sm | 0 1px 2px rgba(0,0,0,0.5) | 轻微浮起 |
| shadow-md | 0 4px 8px rgba(0,0,0,0.4) | 卡片 |
| shadow-lg | 0 8px 16px rgba(0,0,0,0.4) | 弹窗 |
| shadow-xl | 0 16px 32px rgba(0,0,0,0.5) | 模态框 |
| glow-primary | 0 0 0 1px rgba(99,102,241,0.3), 0 0 20px rgba(99,102,241,0.2) | 聚焦光晕 |

### 6.2 模糊

| Token | 值 | 用途 |
|-------|-----|------|
| blur-sm | 4px | 轻微模糊 |
| blur-md | 8px | 玻璃态背景 |
| blur-lg | 16px | 模态遮罩 |
| blur-xl | 24px | 图片遮罩 |

---

## 7. 动效规范

### 7.1 时长

| Token | 值 | 用途 |
|-------|-----|------|
| duration-fast | 150ms | 悬停、聚焦 |
| duration-normal | 250ms | 展开、收起 |
| duration-slow | 350ms | 页面切换 |
| duration-slower | 500ms | 复杂动画 |

### 7.2 缓动

| Token | 值 | 用途 |
|-------|-----|------|
| ease-default | cubic-bezier(0.4, 0, 0.2, 1) | 通用 |
| ease-in | cubic-bezier(0.4, 0, 1, 1) | 进入 |
| ease-out | cubic-bezier(0, 0, 0.2, 1) | 退出 |
| ease-bounce | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性 |

### 7.3 动效原则

- **即时反馈**: 交互后 100ms 内响应
- **自然流畅**: 避免生硬的线性动画
- **有目的性**: 动效服务于功能，不喧宾夺主
- **可关闭**: 尊重 `prefers-reduced-motion`

---

## 8. 图标系统

### 8.1 图标库选择

**Lucide Icons** 作为主要图标库

- 开源免费 (ISC License)
- 基于 Feather Icons，图标更丰富
- 支持树摇优化，按需引入
- React / Vue / Svelte 原生支持
- 设计风格现代、简洁、一致

### 8.2 图标尺寸规范

| 尺寸 | 像素 | 用途 |
|------|------|------|
| XS | 14px | 行内图标、小型标签 |
| SM | 16px | 按钮内图标、菜单项 |
| MD | 20px | 默认尺寸、列表图标 |
| LG | 24px | 标题图标、空状态 |
| XL | 32px | 大型展示、营销页 |

### 8.3 描边粗细

| 场景 | 粗细 | 说明 |
|------|------|------|
| 默认 | 1.5px | 大部分场景 |
| 强调 | 2px | 需要突出的图标 |
| 精细 | 1px | 小尺寸图标 (14px以下) |

### 8.4 图标颜色规则

| 场景 | 颜色 | 说明 |
|------|------|------|
| 默认 | 继承 currentColor | 跟随父元素文字颜色 |
| 次要 | Gray-400 | 辅助信息、占位符 |
| 交互 | Indigo-400 | 可点击、链接 |
| 成功 | Green-500 | 确认、完成 |
| 警告 | Amber-500 | 提醒、注意 |
| 错误 | Red-500 | 删除、错误 |
| 禁用 | Gray-500 | 不可用状态 |

### 8.5 常用图标映射

**导航与布局**

| 图标 | Lucide 名称 | 用途 |
|------|------------|------|
| 🏠 | `home` | 首页 |
| 📋 | `layout-grid` | 服务器列表 |
| 💬 | `message-square` | 消息 |
| 👤 | `user` | 个人中心 |
| ⚙️ | `settings` | 设置 |
| 🔍 | `search` | 搜索 |
| ➕ | `plus` | 添加、创建 |
| ☰ | `menu` | 菜单 |
| ✕ | `x` | 关闭 |
| ← | `arrow-left` | 返回 |
| → | `arrow-right` | 前进 |

**频道与消息**

| 图标 | Lucide 名称 | 用途 |
|------|------------|------|
| # | `hash` | 文字频道 |
| 🔊 | `volume-2` | 语音频道 |
| 📹 | `video` | 视频频道 |
| 📎 | `paperclip` | 附件 |
| 😊 | `smile` | 表情 |
| @ | `at-sign` | 提及 |
| ↩️ | `reply` | 回复 |
| ⋯ | `more-horizontal` | 更多操作 |
| 📌 | `pin` | 置顶 |
| 🔔 | `bell` | 通知 |

**状态与反馈**

| 图标 | Lucide 名称 | 用途 |
|------|------------|------|
| ✓ | `check` | 完成、选中 |
| ✕ | `x-circle` | 关闭、取消 |
| ⚠️ | `alert-triangle` | 警告 |
| ℹ️ | `info` | 信息 |
| 🟢 | `circle` (fill) | 在线状态 |
| 🔴 | `circle` (fill) | 勿扰状态 |

**媒体与文件**

| 图标 | Lucide 名称 | 用途 |
|------|------------|------|
| 📁 | `folder` | 文件夹 |
| 📄 | `file` | 文件 |
| 🖼️ | `image` | 图片 |
| 🎵 | `music` | 音频 |
| ▶️ | `play` | 播放 |
| ⏸️ | `pause` | 暂停 |

**AI 与 Agent**

| 图标 | Lucide 名称 | 用途 |
|------|------------|------|
| 🤖 | `bot` (自定义) | AI Agent |
| ✨ | `sparkles` | AI 功能 |
| 💡 | `lightbulb` | 建议、提示 |
| ⚡ | `zap` | 快速操作 |

### 8.6 图标使用原则

1. **一致性**: 同类功能使用相同图标
2. **可识别**: 图标含义明确，避免歧义
3. **适当留白**: 图标与文字保持 6-8px 间距
4. **可访问**: 重要操作配合文字标签
5. **响应式**: 悬停/点击态提供视觉反馈

### 8.7 自定义图标

部分品牌图标需要定制：

- **Logo**: Shadow 品牌标识
- **Bot**: AI Agent 专用图标
- **服务器默认图标**: 首字母 + 渐变背景

自定义图标遵循 Lucide 设计规范：
- 24x24 画布
- 1.5px 描边
- 圆角端点
- 几何简洁

---

## 9. 组件规范

### 8.1 Button 按钮

**变体**:
- Primary: 主要操作，品牌色填充
- Secondary: 次要操作，描边样式
- Ghost: 最低优先级，透明背景
- Danger: 危险操作，红色警告

**尺寸**: Small (32px) / Medium (40px) / Large (48px)

**状态**: Default / Hover / Active / Disabled / Loading

**设计细节**:
- 圆角: 8px
- 内边距: 10px 18px (Medium)
- 字重: 500
- Hover: 背景加深 + 微光晕
- Active: 缩放 0.98

### 8.2 Input 输入框

**变体**:
- Default: 标准输入框
- Filled: 填充背景样式
- Underline: 下划线样式

**尺寸**: Small (32px) / Medium (40px) / Large (48px)

**状态**: Default / Hover / Focus / Error / Disabled

**设计细节**:
- 背景: Gray-800
- 边框: 1px Gray-700
- 圆角: 8px
- Focus: 边框变 Indigo-500 + 外发光

### 8.3 Card 卡片

**变体**:
- Default: 标准卡片
- Interactive: 可点击，有悬停效果
- Elevated: 带阴影浮起
- Glass: 玻璃态模糊背景

**设计细节**:
- 背景: Gray-800
- 边框: 1px Gray-700
- 圆角: 12px
- 内边距: 20px
- Hover: 边框 Gray-600 + 微上浮 (translateY(-2px))

### 8.4 Avatar 头像

**尺寸**: XS (24px) / SM (32px) / MD (40px) / LG (48px) / XL (64px)

**状态指示器**:
- Online: Green-500
- Idle: Amber-500
- Do Not Disturb: Red-500
- Offline: Gray-500

**设计细节**:
- 圆角: 完全圆形
- 默认背景: 渐变或纯色
- 状态指示器: 右下角，带白边

### 8.5 Badge 徽章

**变体**:
- Default: 信息标签
- Success: 成功状态
- Warning: 警告状态
- Error: 错误状态

**设计细节**:
- 高度: 20px
- 内边距: 4px 10px
- 圆角: 10px (药丸形)
- 字号: 12px
- 字重: 500

### 8.6 Tooltip 提示

**设计细节**:
- 背景: Gray-700
- 文字: White
- 圆角: 6px
- 内边距: 6px 10px
- 字号: 12px
- 最大宽度: 240px
- 出现延迟: 300ms

### 8.7 Modal 模态框

**尺寸**: Small (400px) / Medium (520px) / Large (640px)

**设计细节**:
- 遮罩: rgba(0,0,0,0.7) + blur(8px)
- 背景: Gray-800
- 圆角: 16px
- 边框: 1px Gray-700
- 阴影: shadow-xl
- 入场: scale(0.95) → scale(1) + fade

---

## 10. 场景用例

### 9.1 消息列表
- 相邻同用户消息合并头像
- 消息反应使用 Badge 样式
- 未读消息用品牌色分割线
- 输入框支持 Slash 命令面板

### 9.2 服务器列表
- 图标优先，悬停显示名称
- 激活态: 左侧品牌色竖条
- 未读: 右下角圆点

### 9.3 频道列表
- 分类使用 Overline 样式
- 未读频道: 文字加粗 + 圆点
- 提及: 显示数字徽章

### 9.4 个人主页
- Banner 支持自定义
- 头像带在线状态
- 统计数据突出显示
- AI 分身卡片展示

### 9.5 设置面板
- 左侧导航 + 右侧内容
- 分组使用卡片
- 开关使用 Toggle 组件

---

## 11. 深色/浅色模式

### 10.1 切换机制

- 跟随系统: `prefers-color-scheme`
- 用户手动: 设置中切换
- 持久化: LocalStorage

### 10.2 浅色模式色值

| 元素 | 色值 |
|------|------|
| 背景 | #FFFFFF |
| 卡片 | #F9FAFB |
| 边框 | #E5E7EB |
| 文字 | #111827 |
| 次要文字 | #6B7280 |

---

## 12. 无障碍

- 所有交互元素可键盘访问
- Focus 状态清晰可见
- 颜色对比度符合 WCAG AA 标准
- 图片提供 alt 文本
- 动效尊重 `prefers-reduced-motion`

---

## 13. 设计 Demo

`docs/demos/` 目录下可查看交互原型：

- `components.html` — 基础组件库
- `icons.html` — 图标系统（Lucide Icons）
- `message-list.html` — 消息列表场景
- `profile.html` — 个人主页场景
- `navigation.html` — 导航布局
- `settings.html` — 设置面板场景

---

*Shadow Design Team | 2024*