# Website 导航重构决策文档

> 决策时间：2025-03-29
> PR: https://github.com/buggyblues/shadow/pull/120

---

## 1. 背景与问题

### 1.1 现状问题

**两套不一致的导航系统：**
- Rspress nav（文档页面）：7 个入口
- PublicNav（公共页面）：6 个入口，缺少 Desktop

**冗余内容：**
- `/api/` 和 `/api-doc/` 两套 API 文档目录
- `/features.mdx` 与 `/product/` 内容重叠
- `/tokens.mdx` 定位模糊

**Footer 不完整：**
- 缺少法律条款（Privacy / Terms）
- 缺少博客入口
- 缺少社区公约

### 1.2 设计目标

- 顶部导航 ≤ 5 个入口
- 统一两套导航系统
- 精简冗余页面
- 完善 Footer 结构

---

## 2. 决策记录

### 2.1 顶部导航精简

**原方案（7 个）：**
```
Product | Desktop | Buddy Market | Guide | Pricing | Shrimp Coins | API
```

**决策过程：**
1. 隐藏 Pricing → 移到 Footer
2. Buddy Market → 改名 Buddy
3. Shrimp Coins → 整合到 Guide 侧边栏
4. Desktop → 改名 Download，路径改为 /download
5. Discover 方案 → 改为 Market → 最终定为 Buddy

**最终方案（5 个）：**
```
Buddy | Guide | Docs | API | Download
```

| 入口 | 说明 |
|------|------|
| Buddy | 营销 + 发现页面，整合原 Buddy Market |
| Guide | 玩法指南，整合 Shrimp Coins 内容 |
| Docs | 产品文档入口 |
| API | 开发者文档 |
| Download | 桌面端下载页 |

### 2.2 Guide 侧边栏设计

**决策：** 创建独立的 Guide 目录，包含 5 个子页面

```
玩法指南
├── 新手入门          # Getting Started
├── Shrimp Coins      # 从 /tokens 移入
├── Buddy 系统        # Buddy 使用指南
├── 社区玩法          # Community Features
└── 进阶技巧          # Advanced Tips
```

### 2.3 Docs 侧边栏调整

**决策：**
1. 移除「Desktop App」条目（已独立为 Download 入口）
2. 「Shadow 桌面端」改回「OpenClaw 插件」

**最终结构（9 个）：**
```
产品文档
├── 快速开始
├── 社区与服务器
├── 频道与消息
├── AI 搭子
├── Buddy 租赁
├── 社区店铺
├── 共享工作区
├── OpenClaw 插件
└── 常见问题
```

### 2.4 Footer 重构

**决策：** 增加第四列「法律」

**最终结构（5 列）：**
```
产品           资源              社区              法律
────           ────              ────              ────
频道           玩法指南          GitHub            Privacy
AI 搭子        博客 ←新增        Discord           Terms
Buddy 市场     产品文档          Twitter/X         社区公约 ←新增
社区           API 文档                            Skills ←新增
工作区         定价
店铺
桌面端
```

**新增法律页面：**
- `/privacy` — Privacy Policy
- `/terms` — Terms of Service
- `/community-guidelines` — 社区公约

**Skills 链接：**
- 指向 Shadow CLI 的 SKILL.md 原文（GitHub raw）

### 2.5 页面删除决策

| 删除文件 | 原因 |
|----------|------|
| `/features.mdx` | 内容与 Product 重叠 |
| `/tokens.mdx` | 移入 Guide/shrimp-coins |
| `/buddies.mdx` | 整合到 /buddy |
| `/desktop.mdx` | 改为 /download |
| `/api/` 目录 | 旧 API 文档，与 /api-doc/ 重复 |

---

## 3. 路由变更表

### 3.1 新增路由

| 路径 | 说明 |
|------|------|
| `/buddy` | Buddy 市场营销页 |
| `/download` | 桌面端下载页 |
| `/guide/` | 玩法指南（5 子页） |
| `/blog/` | 博客占位页 |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Service |
| `/community-guidelines` | 社区公约 |

### 3.2 废弃路由

| 旧路径 | 处理 |
|--------|------|
| `/buddies` | 重定向到 `/buddy` |
| `/desktop` | 重定向到 `/download` |
| `/tokens` | 内容移至 `/guide/shrimp-coins` |
| `/features` | 删除 |
| `/api/*` | 删除，使用 `/api-doc/*` |

---

## 4. 未完成事项

- [ ] 配置重定向规则（buddies → buddy, desktop → download）
- [ ] 博客页面实际内容
- [ ] Pricing 页面内容更新
- [ ] Discord / Twitter 链接填充

---

## 5. 参与者

- 决策者：彭猫
- 执行者：小炸

---

## 6. 附录

### 6.1 文件变更统计

```
79 files changed
+1299 insertions
-11656 deletions
```

### 6.2 相关链接

- PR: https://github.com/buggyblues/shadow/pull/120
- 分析文档: `docs/website-navigation-analysis.md`