# Shadow 品牌与产品设计规范

## 1. 品牌定位

### 1.1 品牌愿景
**让 AI 成为每个人的日常伙伴**

Shadow 是一个连接用户与 AI Agent 的社交平台，让用户可以轻松发现、创建和与个性化的 AI 伙伴互动。

### 1.2 目标用户
- **核心用户**: 18-30 岁数字原住民
- **特征**: 熟悉 AI 工具、追求个性化表达、重视社交体验
- **使用场景**: 日常陪伴、创意协作、知识获取、娱乐互动

### 1.3 品牌个性
- **友好**:  approachable，降低 AI 使用门槛
- **活力**:  年轻、有能量、不沉闷
- **个性**:  支持自我表达，拒绝千篇一律
- **智能**:  技术先进，体验流畅

### 1.4 品牌关键词
`AI伙伴` `社交` `个性化` `创意` `轻松` `未来感`

---

## 2. 视觉语言

### 2.1 色彩系统

#### 主色调
| 名称 | 色值 | 用途 |
|------|------|------|
| Primary | `#00C8D6` | 主按钮、链接、强调 |
| Primary Hover | `#00A3B0` | 悬停状态 |
| Accent | `#FF6B9D` | 次级强调、标签 |

#### 背景色
| 名称 | 色值 | 用途 |
|------|------|------|
| BG Primary | `#0F0F1A` | 主背景（深色模式）|
| BG Secondary | `#1A1A2E` | 卡片背景 |
| BG Tertiary | `#252542` | 输入框、悬浮层 |

#### 文字色
| 名称 | 色值 | 用途 |
|------|------|------|
| Text Primary | `#F2F3F5` | 标题、正文 |
| Text Secondary | `#B5BAC1` | 次要文字 |
| Text Muted | `#80848E` | 提示、禁用 |

#### 功能色
| 名称 | 色值 | 用途 |
|------|------|------|
| Success | `#57F287` | 成功状态 |
| Warning | `#FEE75C` | 警告状态 |
| Danger | `#ED4245` | 错误、删除 |

### 2.2 字体规范

#### 字体栈
```css
font-family: 'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
```

#### 字号规范
| 级别 | 大小 | 字重 | 用途 |
|------|------|------|------|
| H1 | 24px | 700 | 页面标题 |
| H2 | 20px | 600 | 区块标题 |
| H3 | 16px | 600 | 卡片标题 |
| Body | 15px | 400 | 正文 |
| Small | 13px | 400 | 辅助文字 |
| Caption | 12px | 500 | 标签、时间 |

### 2.3 圆角规范
| 级别 | 值 | 用途 |
|------|-----|------|
| Small | 8px | 按钮、标签 |
| Medium | 12px | 输入框、小卡片 |
| Large | 16px | 卡片、弹窗 |
| XL | 24px | 大卡片、模态框 |
| Full | 9999px | 头像、胶囊按钮 |

### 2.4 阴影规范
```css
/* 小阴影 - 按钮、标签 */
shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);

/* 中阴影 - 卡片 */
shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);

/* 大阴影 - 弹窗、悬浮 */
shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);

/* 强调阴影 - 主按钮 */
shadow-accent: 0 4px 20px rgba(0, 200, 214, 0.3);
```

---

## 3. UI 组件规范

### 3.1 Button

#### Primary Button
```tsx
<button className="
  px-6 py-2.5
  bg-[#00C8D6] hover:bg-[#00A3B0]
  text-white font-medium
  rounded-lg
  shadow-[0_4px_20px_rgba(0,200,214,0.3)]
  hover:shadow-[0_6px_24px_rgba(0,200,214,0.4)]
  active:scale-[0.98]
  transition-all duration-200
">
  按钮文字
</button>
```

#### Secondary Button
```tsx
<button className="
  px-6 py-2.5
  bg-white/10 hover:bg-white/15
  text-white font-medium
  rounded-lg
  border border-white/10
  active:scale-[0.98]
  transition-all duration-200
">
  次要按钮
</button>
```

#### Ghost Button
```tsx
<button className="
  px-4 py-2
  text-[#B5BAC1] hover:text-white
  font-medium
  rounded-lg
  hover:bg-white/5
  transition-all duration-200
">
  文字按钮
</button>
```

### 3.2 Input

#### Text Input
```tsx
<input className="
  w-full px-4 py-3
  bg-[#252542]
  border border-white/10
  rounded-xl
  text-white placeholder-[#80848E]
  focus:border-[#00C8D6]/50 focus:ring-2 focus:ring-[#00C8D6]/20
  transition-all duration-200
"/>
```

### 3.3 Card

#### Standard Card
```tsx
<div className="
  bg-[#1A1A2E]
  border border-white/5
  rounded-2xl
  p-6
  shadow-[0_4px_16px_rgba(0,0,0,0.3)]
">
  卡片内容
</div>
```

#### Hoverable Card
```tsx
<div className="
  bg-[#1A1A2E]
  border border-white/5
  rounded-2xl
  p-6
  shadow-[0_4px_16px_rgba(0,0,0,0.3)]
  hover:border-[#00C8D6]/30
  hover:-translate-y-1
  hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]
  transition-all duration-300
">
  可交互卡片
</div>
```

### 3.4 Avatar

```tsx
<img className="
  w-10 h-10
  rounded-full
  bg-[#252542]
  object-cover
  ring-2 ring-transparent
  hover:ring-[#00C8D6]/50
  transition-all duration-200
"/>
```

### 3.5 Badge

```tsx
<span className="
  px-2.5 py-1
  bg-[#00C8D6]/20
  text-[#00C8D6]
  text-xs font-medium
  rounded-full
">
  标签
</span>
```

---

## 4. 布局规范

### 4.1 间距系统
| Token | 值 | 用途 |
|-------|-----|------|
| space-1 | 4px | 紧凑间距 |
| space-2 | 8px | 元素内间距 |
| space-3 | 12px | 组件内间距 |
| space-4 | 16px | 标准间距 |
| space-6 | 24px | 区块间距 |
| space-8 | 32px | 大区块间距 |

### 4.2 布局结构

#### 桌面端
```
┌────────────────────────────────────────┐
│  Sidebar    │        Main Content       │
│   72px      │         flex-1            │
│             │                           │
│  [Servers]  │    [Header]               │
│             │    ─────────────────      │
│             │                           │
│             │    [Content Area]         │
│             │                           │
│             │    ─────────────────      │
│             │    [Input Area]           │
└────────────────────────────────────────┘
```

#### 移动端
```
┌─────────────────────────┐
│       Main Content      │
│                         │
│                         │
│                         │
├─────────────────────────┤
│  🏠  🔍  ➕  💬  👤     │
└─────────────────────────┘
```

---

## 5. 动效规范

### 5.1 过渡时间
| 类型 | 时长 | 用途 |
|------|------|------|
| Instant | 100ms | 颜色变化、透明度 |
| Fast | 200ms | 按钮反馈、小交互 |
| Normal | 300ms | 卡片悬浮、展开 |
| Slow | 500ms | 页面过渡、大动画 |

### 5.2 缓动函数
```css
/* 标准 */
ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

/* 进入 */
ease-in: cubic-bezier(0, 0, 0.2, 1);

/* 退出 */
ease-out: cubic-bezier(0.4, 0, 1, 1);

/* 弹性 */
ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### 5.3 常用动画

#### Fade In
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

#### Slide Up
```css
@keyframes slideUp {
  from { 
    opacity: 0; 
    transform: translateY(20px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}
```

#### Scale In
```css
@keyframes scaleIn {
  from { 
    opacity: 0; 
    transform: scale(0.95); 
  }
  to { 
    opacity: 1; 
    transform: scale(1); 
  }
}
```

#### Pulse (用于通知)
```css
@keyframes pulse {
  0%, 100% { 
    box-shadow: 0 0 0 0 rgba(0, 200, 214, 0.4); 
  }
  50% { 
    box-shadow: 0 0 0 8px rgba(0, 200, 214, 0); 
  }
}
```

---

## 6. 功能矩阵

### 6.1 核心功能

| 功能 | 优先级 | 描述 |
|------|--------|------|
| AI 聊天 | P0 | 与 Buddy 进行文字对话 |
| Buddy 发现 | P0 | 浏览和搜索公开 Buddy |
| 好友系统 | P0 | 添加好友、私聊 |
| 服务器/频道 | P0 | 群组聊天空间 |
| Buddy 创建 | P1 | 自定义创建 AI 伙伴 |
| 语音消息 | P1 | 发送和接收语音 |
| 文件分享 | P1 | 图片、文档传输 |
| 市场租赁 | P2 | Buddy 租赁交易 |
| 工作空间 | P2 | 文件管理和协作 |

### 6.2 平台覆盖

| 平台 | 状态 | 备注 |
|------|------|------|
| Web | ✅ 已上线 | 主平台 |
| Desktop | ✅ 已上线 | Electron |
| iOS | 🚧 开发中 | React Native |
| Android | 🚧 开发中 | React Native |

### 6.3 功能优先级矩阵

```
          高价值
            │
   P1 语音  │  P0 AI聊天
   P2 市场  │  P0 Buddy发现
            │
  ──────────┼────────── 高使用率
            │
   P2 工作  │  P1 Buddy创建
   空间      │  P1 文件分享
            │
          低价值
```

---

## 7. 设计原则

### 7.1 核心原则

1. **清晰优先**
   - 信息层级明确
   - 操作反馈即时
   - 错误提示友好

2. **一致性**
   - 组件风格统一
   - 交互模式统一
   - 术语表达统一

3. **效率**
   - 减少操作步骤
   - 支持快捷操作
   - 智能默认选项

4. **愉悦**
   - 适当的动效
   - 惊喜的微交互
   - 个性化表达

### 7.2 设计检查清单

- [ ] 颜色对比度符合 WCAG 2.1 AA 标准
- [ ] 交互元素最小点击区域 44x44px
- [ ] 加载状态有明确反馈
- [ ] 空状态有引导提示
- [ ] 错误状态有恢复指引
- [ ] 支持键盘导航
- [ ] 支持屏幕阅读器

---

## 8. 文件组织

### 8.1 设计资源
```
design/
├── brand/
│   ├── logo/
│   ├── colors/
│   └── typography/
├── components/
│   ├── buttons/
│   ├── inputs/
│   ├── cards/
│   └── icons/
├── templates/
│   ├── web/
│   ├── mobile/
│   └── desktop/
└── assets/
    ├── illustrations/
    └── animations/
```

### 8.2 代码组织
```
apps/
├── web/src/
│   ├── components/ui/      # 基础组件
│   ├── components/common/  # 业务组件
│   ├── styles/
│   │   ├── globals.css
│   │   └── tokens.css      # 设计令牌
│   └── lib/
│       └── theme.ts        # 主题配置
├── mobile/src/
│   └── ...
└── desktop/src/
    └── ...
```

---

*文档版本: 1.0*
*最后更新: 2025-01*
