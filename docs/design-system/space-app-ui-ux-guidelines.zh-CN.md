# Space App UI/UX 设计规范

> Draft v0.3. 采用平台设计规范的写法：先给原则，再给具体结构、尺寸、组件行为和验收方法。规范不点名具体 Space App，但提供可直接套用的页面模板。

## 设计原则

### 让用户知道自己在哪

每个 Space App 的首屏都要同时回答：

- 当前 Space App 是什么。
- 当前 server / channel / actor context 是什么。
- 当前主要对象是什么。
- 用户现在能执行什么动作。

不要把这些信息藏在 hover、toast、开发者日志或宿主页面标题里。

### 让内容决定界面

工具型 Space App 优先显示列表、表格、详情和操作状态。内容型 Space App 优先显示搜索、筛选、正文和作者信息。画布或实时 Space App 可以全屏，但必须保留模式、工具、状态和退出路径。

### 像移动 Space App，而不是缩小网页

移动端必须重新排布，不允许仅依赖桌面 CSS 缩放。

- 顶部只保留搜索、标题或返回。
- 主导航放到底部，2-4 个入口。
- 主操作放在底部、浮动按钮或页面底部 action bar。
- 任何 320px 宽度都不能出现页面横向滚动。

## Space App Shell

### Desktop Shell

用于桌面网页或宽 WebView。

```
AppShell
  Header: 56-64px
    Leading: app mark + current context
    Center: search / tabs / breadcrumb
    Trailing: primary action + utility actions
  Body
    Optional Sidebar: 240-320px
    Main Surface: minmax(0, 1fr)
    Optional Detail / Inspector: 320-420px
```

Rules:

- Header 高度默认 56-64px。复杂工具最多 72px。
- Header 只能有一套主导航。不要同时出现 top tabs、sidebar nav 和大按钮组。
- Sidebar 用于跨对象导航；Inspector 用于当前对象属性。两者语义不能混用。
- Main Surface 必须 `min-width: 0`，防止长内容撑开布局。

### Mobile Shell

用于手机 WebView 或窄浏览器。

```
MobileShell
  TopBar: 52-64px + safe-area top
    Search OR title OR back + title
  Content: single column
  BottomTabBar: 64px + safe-area bottom
    2-4 destinations
```

Rules:

- 必须设置 viewport：

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

- BottomTabBar 高度：`64px + env(safe-area-inset-bottom)`。
- Content 底部 padding 至少：`80px + env(safe-area-inset-bottom)`。
- 触控目标不小于 44x44px。
- 不要在移动端显示完整桌面品牌区、完整顶部导航和大按钮组。

### WebView Chrome 配合

宿主 WebView 负责浏览器级操作：关闭、刷新、外部打开、宿主返回。Space App 负责自己的路由和内容状态。

Do:

- Space App 内 back 只返回 Space App 内上一层。
- 关闭 Space App 使用宿主 chrome。
- 避免左侧边缘滑动直接退出 WebView。

Don’t:

- 在 Space App 页面里重复做浏览器前进、后退、关闭按钮。
- 让 Space App 内返回和宿主返回竞争。

## 页面模板

### 1. Index / Home

用于进入 Space App 后的默认界面。

```
Header
  Title or Search
  Primary action
Filter Row (optional)
Object List / Board / Gallery / Canvas Entry
Empty State
```

Concrete requirements:

- 首屏必须出现真实工作对象或创建入口。
- 空状态包含：标题、一句原因、一个主动作。
- 搜索框 placeholder 写对象，例如“搜索任务、标签或成员”，不要只写“搜索”。
- 如果有筛选，当前筛选必须显示为 chip，并提供清除。

Example empty state:

```
还没有内容
创建第一项，或让 Buddy 根据当前频道生成草稿。
[创建] [派发给 Buddy]
```

### 2. List Row

适用于任务、问题、测验、提交、作品、技能、房间等对象。

```
Row
  Leading (optional icon/avatar/status)
  Main
    Title
    Summary or latest status
    Meta line
  Trailing
    Primary lightweight action OR More menu
```

Metrics:

- Desktop row padding: 14-18px vertical, 16-24px horizontal。
- Mobile row padding: 16-20px vertical, 16-20px horizontal。
- Title: 16-18px desktop, 17-22px mobile。
- Meta: 12-14px。
- More button: 36-44px square。

Text behavior:

- Title: `overflow-wrap: anywhere; word-break: break-word;`
- Summary: mobile 最多 3-4 行；desktop 可 2-3 行。
- Meta line 可以换行，不允许撑开 row。

### 3. Detail

用于查看和操作单个对象。

```
Back / Breadcrumb
Object Header
  Title
  Meta
  Status
Action Bar
Body
Related Activity / Comments / Results
```

Action priority:

- Primary: 保存、发布、提交、开始、写入。
- Secondary: 收藏、复制、导出、派发、打开工作区资源。
- Destructive: 删除、重置、清空，必须放在更多菜单或危险区。

Concrete requirements:

- 第一屏必须包含 title、status、primary action。
- 长正文使用正常文档排版。
- Markdown 表格和代码块局部横向滚动，不允许撑开页面。
- 评论、日志、历史记录可以折叠，但折叠入口必须显示数量。

### 4. Editor / Composer

用于创建、编辑、提交和发布。

```
Editor
  Context header
  Required fields
  Optional groups
  Preview (optional)
  Sticky action bar
```

Metrics:

- Field height: 44px minimum。
- Textarea min-height: 96-160px，按任务复杂度递增。
- Form gap: 12-20px。
- Mobile sticky action bar: bottom safe area aware。

Concrete requirements:

- 必填字段在 label 或错误中明确。
- 提交按钮 disabled 时，用户能看出缺什么。
- 保存失败不丢失输入。
- 上传、代码、CSS、JSON 等高风险输入显示大小、格式和失败原因。

### 5. Dispatch / Buddy Flow

用于让 Buddy 执行任务、评审、生成、安装或处理对象。

```
Dispatch Panel
  Target object
  Buddy selector or target summary
  Permission reason
  Submit
  Delivery receipt
```

Concrete requirements:

- 触发前说明为什么需要 Buddy 权限。
- 权限缺失时显示授权入口，而不是禁用按钮后没有解释。
- 成功后显示 receipt：已派发给谁、关联对象、可在哪里继续看。
- 失败后显示可恢复动作：重试、重新授权、换 Buddy、复制任务说明。

Receipt example:

```
已派发给 Buddy
任务已发送到 #频道名。你可以打开 Copilot 查看进度。
[打开 Copilot] [复制任务]
```

### 6. Canvas / Realtime

用于画布、游戏、直播房间、回放或多人协作。

```
Realtime Surface
  Main stage
  Floating toolbar
  Mode indicator
  Connection status
  Inspector or log drawer
```

Concrete requirements:

- 模式必须常驻可见：浏览、编辑、选择、拖动、播放、观战等。
- 工具栏不遮挡核心对象；移动端工具栏优先靠底部。
- 显示连接状态：连接中、在线、重连、离线。
- 所有本地操作有保存或同步反馈。
- 回放/播放类界面必须有暂停、继续、退出、进度。

## Navigation Patterns

### Top Tabs

Use when sections are siblings under the same object.

- 2-6 个标签。
- Desktop 可横向放在 header 或内容顶部。
- Mobile 每个 tab 等宽，使用底部或顶部紧凑 tab，不用大胶囊。
- 不要在 tab 下方立刻重复同名标题。

### Bottom Tabbar

Use on mobile for primary destinations.

```
Tab item
  Icon: 20-24px
  Label: 11-12px
  Hit area: >= 44px
```

- 2-4 个入口。
- 当前项使用主色图标/文字或底部 indicator。
- 不把设置、删除、刷新放进主 Tabbar。

### More Menu

Use for secondary or destructive actions.

- 触发按钮 36-44px。
- 菜单宽度 mobile 不超过 `calc(100vw - 24px)`。
- 菜单必须使用 fixed/portal 或 viewport clamp，避免被滚动容器裁切。
- 危险动作视觉分组并二次确认。

## 具体交互规范

### 启动与上下文

Space App 启动时按以下顺序处理：

1. 读取 launch context。
2. 解析 server、channel、actor、权限和 app-specific route。
3. 渲染 Space App shell skeleton。
4. 加载首屏数据。
5. 数据返回后显示可操作界面。

Required behavior:

- 如果 launch context 缺失，显示“无法打开 Space App”错误页，并提供重新加载。
- 如果 actor 未授权，显示授权页，不渲染空白工作区。
- 如果首屏数据失败，保留 shell，显示局部错误和重试按钮。
- 首屏数据加载不得阻塞宿主 chrome。

### 返回

Back action 必须按优先级处理：

1. 如果有打开的菜单、popover、sheet 或 dialog，先关闭它。
2. 如果当前表单有未保存更改，显示离开确认。
3. 如果 Space App router 有上一层，返回上一层。
4. 如果已经在 Space App 根路由，交给宿主关闭或保持当前页。

Dirty form confirmation:

```
放弃更改？
你编辑的内容尚未保存。
[继续编辑] [放弃]
```

Do:

- Space App 内返回按钮只处理 Space App 内状态。
- 移动端左滑返回不能直接退出 WebView。
- Detail 返回列表时保留列表滚动位置和筛选条件。

Don’t:

- 在未保存表单中直接返回列表。
- 在根路由调用浏览器 `history.back()` 导致宿主退出。

### 搜索

Search field behavior:

- 输入时不立即清空结果。
- 300ms debounce 后更新建议或结果。
- 按 Enter / Search 提交稳定查询。
- 提交后 query 写入 URL 或 Space App route state。
- 清除按钮出现于非空输入状态。

Loading behavior:

- 搜索中保留旧结果，并在结果区显示局部 loading。
- 搜索失败保留旧结果，显示可关闭错误条。
- 空结果显示搜索词和清除动作。

Example:

```
没有找到“deployment”
[清除搜索]
```

### 筛选与排序

Filter interaction:

- 点击筛选按钮打开 popover、sheet 或侧栏。
- 选中条件后立即反映在结果区，或在复杂筛选中使用“应用筛选”。
- 当前条件显示为 chips。
- 每个 chip 可单独移除。
- 提供“清除全部”。

Mobile behavior:

- 筛选面板从底部打开。
- 面板高度不超过视口 80%。
- 背景内容不可滚动。
- 关闭后焦点回到筛选按钮。

Sorting behavior:

- 排序是单选。
- 当前排序项显示 check。
- 排序变更后不清空搜索和筛选。

### Tabs

Tab interaction:

- Tab 切换不丢失同页筛选、滚动和编辑草稿。
- Tab 状态应写入 URL、hash 或可恢复 state。
- 键盘左右方向键在 tablist 内切换焦点。
- 激活当前 tab 后，内容区标题不重复 tab 文案。

Mobile:

- 顶部 tabs 只用于同一对象下的 sibling views。
- 底部 Tabbar 用于主要目的地。
- 底部 Tabbar 切换不应重建全局 Space App context。

### 菜单与 Popover

Open:

- 点击触发器打开。
- 触发器显示 active 状态。
- 菜单相对触发器定位，并在 viewport 内 clamp。

Dismiss:

- 点击外部关闭。
- Esc 关闭。
- 路由变化关闭。
- 触发器再次点击关闭。

Focus:

- 打开后焦点进入第一个可用菜单项。
- 关闭后焦点回到触发器。
- 禁用项不可聚焦。

Menu item rules:

- 一行一个动作。
- 危险动作放底部并使用 danger 样式。
- 动作文案用动词加对象。

### Dialog 与 Sheet

Dialog 用于阻塞型确认；Sheet 用于移动端复杂选择或编辑。

Dialog rules:

- 必须有明确标题。
- Primary action 和 cancel action 都可见。
- Esc / backdrop 只执行 cancel。
- Destructive confirm 使用危险样式。

Sheet rules:

- 移动端从底部出现。
- 高度按内容自适应，最高 90vh。
- 有 drag handle 或明确关闭按钮。
- 内部滚动不带动背景滚动。

Don’t:

- 用 dialog 承载主要编辑流程。
- 在 dialog 中再打开第二个 dialog。

### 创建

Create flow:

1. 用户点击创建。
2. 打开 composer 或创建页。
3. 用户输入必填字段。
4. Primary action 从 disabled 变为 enabled。
5. Submit 后显示 loading。
6. 成功后进入新对象详情，或把新对象插入当前列表并高亮 1.5 秒。
7. 失败时保留输入并显示字段错误或全局错误。

Required:

- 创建成功后不得只显示 toast 而不更新内容。
- 创建失败不得清空用户输入。
- 重复提交时按钮保持 loading 或 disabled。

### 编辑与保存

Edit states:

- Clean：没有未保存更改。
- Dirty：有未保存更改。
- Saving：正在保存。
- Saved：已保存。
- Failed：保存失败。

Required UI:

- Dirty 状态显示“未保存”。
- Saving 状态禁用提交按钮，但不禁用取消。
- Saved 状态可用短暂 inline 状态或 toast。
- Failed 状态显示重试，并保留 dirty 内容。

Autosave:

- 如果使用 autosave，必须显示保存状态。
- Autosave 失败后停止覆盖远端内容，并允许用户重试。
- 离开 dirty 页面前必须确认。

### 删除与危险操作

Danger flow:

1. 用户点击危险动作。
2. 显示确认 dialog。
3. 文案说明对象和影响。
4. 用户确认后执行。
5. 成功后移除对象或返回上一层。
6. 失败后保留对象并显示原因。

Confirmation copy:

```
删除这个项目？
删除后，相关评论和历史记录仍可能保留在审计日志中。
[取消] [删除]
```

Required:

- 删除按钮不能是默认 primary。
- 批量删除必须显示数量。
- 不可恢复操作需要更明确的文案。

### 选择与批量操作

Selection mode:

- 进入选择模式后，顶部或底部 action bar 显示已选数量。
- 列表项显示 checkbox 或 selected state。
- 提供取消选择。
- 批量动作只显示对当前选择有效的操作。

Keyboard:

- Shift + click 可范围选择（desktop）。
- Esc 退出选择模式。

Mobile:

- 长按或显式“选择”进入选择模式。
- 不依赖 hover checkbox。

### 上传

Upload flow:

1. 用户选择文件。
2. 立即校验类型、大小和数量。
3. 显示上传队列。
4. 每个文件显示 pending、uploading、done、failed。
5. 失败项可重试或移除。

Required:

- 上传前展示限制：类型、大小、数量。
- 上传中用户可以继续编辑其他字段。
- 提交内容前必须明确文件是否已上传完成。
- 图片上传成功后显示缩略图和移除按钮。

### 授权

Authorization flow:

1. 用户触发需要权限的动作。
2. Space App 检查当前权限。
3. 权限不足时展示授权说明。
4. 用户确认后打开宿主授权。
5. 授权成功后返回原动作。
6. 授权失败或拒绝后保留当前上下文。

Authorization copy anatomy:

```
需要授权
此操作需要读取当前服务器的任务，并把结果发送给选中的 Buddy。
[授权并继续] [取消]
```

Required:

- 授权文案必须包含 action、resource、reason。
- 用户拒绝后显示如何重试。
- 授权成功后继续用户原本要做的动作，除非动作已过期。

### Buddy 派发

Dispatch flow:

1. 用户选择对象或当前上下文。
2. 用户选择 Buddy 或使用默认目标。
3. Space App 展示任务摘要。
4. Space App 检查 task grant。
5. 用户确认派发。
6. Space App 显示 delivery receipt。
7. 用户可打开 Copilot、复制任务或返回。

Task summary must include:

- 目标对象。
- 期望输出。
- 可见范围。
- 相关频道或工作区资源。

Delivery receipt:

- 显示派发目标。
- 显示状态：sent、accepted、failed 或 unknown。
- 提供打开后续对话或查看结果的入口。

Don’t:

- 只显示“已发送”toast。
- 在权限失败时静默吞掉派发。
- 派发后让用户不知道去哪看进度。

### 实时协作

Realtime state machine:

```
idle -> connecting -> live
live -> reconnecting -> live
reconnecting -> offline
offline -> reconnecting
```

Required UI:

- connecting：显示正在连接。
- live：显示在线或同步完成。
- reconnecting：显示正在重连，允许只读或本地暂存。
- offline：说明哪些操作不可用。

Conflict handling:

- 远端更新不能覆盖正在编辑的本地字段，除非用户确认。
- 冲突显示对比、保留本地、使用远端三个路径中的至少两个。

### Canvas / Drag

Pointer behavior:

- 空格键 / hand mode 用于 pan。
- Click 选择对象。
- Drag 移动对象。
- Shift / multi-select 用于多选（desktop）。
- Pinch zoom 或 +/- controls 用于缩放（mobile 必须有按钮 fallback）。

Required:

- 当前模式常驻可见。
- 选中对象有 clear selection affordance。
- 拖动过程中显示 snap / guide / position feedback（如适用）。
- 保存失败时不得丢失本地布局。

### 键盘

General:

- Enter 提交搜索。
- Esc 关闭菜单、sheet、dialog 或退出选择模式。
- Cmd/Ctrl + S 保存当前编辑。
- Tab 顺序与视觉顺序一致。

Text inputs:

- 多行输入中 Enter 换行。
- Cmd/Ctrl + Enter 可提交长文本表单。

Mobile keyboard:

- 键盘打开时，当前输入不被遮挡。
- Submit action 仍可触达。
- 页面不应产生横向滚动。

### Toast

Toast 只用于非阻塞反馈，不承载唯一结果。

Use toast for:

- 保存成功。
- 复制成功。
- 后台任务已开始。

Do not use toast as the only UI for:

- 授权失败。
- 派发 receipt。
- 删除确认。
- 表单校验错误。
- 长任务进度。

## State Patterns

### Loading

Do:

- 列表用 skeleton row。
- 详情保留 header skeleton 和 body skeleton。
- 局部提交只锁定相关按钮。

Don’t:

- 用全屏 spinner 替代已有内容。
- 加载时改变页面结构导致布局跳动。

### Empty

Empty state anatomy:

```
Icon or small illustration
Title
One sentence reason
Primary action
Secondary action (optional)
```

Rules:

- Title 不超过 12 个中文字符或 5 个英文词。
- 描述只解释当前为空的原因。
- 必须提供可执行下一步，除非用户没有权限。

### Error

Error anatomy:

```
What happened
Why it may have happened
Recovery action
Diagnostic detail (optional, collapsed)
```

Examples:

- “保存失败。网络已断开，请重试。”
- “需要授权。此操作会读取当前服务器的任务列表。”
- “上传失败。图片不能超过 10MB。”

### Unauthorized

- 说明缺少什么权限。
- 说明授权后能做什么。
- 提供授权、返回、联系管理员三类路径中的至少一种。

### Offline / Reconnecting

- 显示是否可继续阅读。
- 说明编辑是否会暂存。
- 重连成功后显示同步结果。

## Visual Metrics

These are default ranges, not a brand lock.

| Element | Desktop | Mobile |
| --- | --- | --- |
| Header height | 56-64px | 52-64px + safe area |
| Bottom tabbar | N/A | 64px + safe area |
| Sidebar width | 240-320px | Use drawer or hide |
| Inspector width | 320-420px | Use sheet/page |
| Content max width for prose | 720-860px | 100% |
| Control height | 36-44px | 44-48px |
| Icon-only button | 36-40px | 44px |
| Panel radius | 8-16px | 12-16px |
| Object card radius | 8-12px | 10-14px |

Typography:

- Body: 15-17px。
- Mobile body: minimum 16px for long reading or input-heavy screens。
- Meta: 12-14px。
- Mobile title: 22-30px unless it is a true hero。
- Do not scale type directly with viewport width.

## Content Rules

### Long Text

All user-generated text must handle:

- Long Chinese titles.
- Long English words.
- URLs.
- Code identifiers.
- Markdown tables.
- Inline images.

Required CSS patterns:

```css
.content-title {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.markdown pre,
.markdown table {
  max-width: 100%;
  overflow-x: auto;
}
```

### Copy

- Button labels describe results.
- Error messages include recovery.
- Permission text names the resource and action.
- Empty states point to the next action.
- Do not use feature-tour text inside primary workflows.

## Accessibility

Required:

- Text contrast >= 4.5:1 for normal text.
- Touch target >= 44x44px on mobile.
- `aria-label` for icon-only buttons.
- Visible focus state for keyboard users.
- Reduced motion alternative for non-essential animation.
- Form errors connected to fields.

## Security and Trust

Required:

- Destructive actions use confirmation.
- Authorization requests name action, resource, and reason.
- Uploads display file constraints.
- Generated config, CSS, JSON, code, and URLs show validation errors before saving.
- Sensitive details appear only to users with the right capability.

## Mobile WebView Verification

Every Space App must pass:

```js
const widthOk =
  document.documentElement.scrollWidth <= window.innerWidth &&
  document.body.scrollWidth <= window.innerWidth
```

Test widths:

- 320px
- 390px
- 430px

Test flows:

- Open default route.
- Search or filter.
- Open detail.
- Create or edit.
- Trigger async submit.
- Trigger authorization-required action.
- Show empty state.
- Show error state.
- Open keyboard on the longest input.

Pass conditions:

- No horizontal page scroll.
- Last list item is not hidden behind bottom UI.
- Input and submit remain reachable with keyboard open.
- Space App back does not close the WebView.
- Host chrome does not cover Space App controls.

## Design Review Checklist

Before shipping, answer these concretely:

- What is the primary object on the first screen?
- What is the primary action?
- Where does search live?
- Where does filtering live?
- How does mobile navigation work?
- What happens when the user has no data?
- What happens when the user lacks permission?
- What does a successful Buddy dispatch look like?
- What does a failed save look like?
- What content can be longest, and how does it wrap?
- What UI remains visible during realtime reconnect?
- Which actions are destructive, and where is confirmation?

## Iteration Model

When a new issue appears, add it as one of:

- Principle: applies to most Space Apps.
- Pattern: reusable page or component structure.
- Metric: measurable size, spacing, or viewport rule.
- Exception: allowed only in a named situation such as canvas, realtime, game, or portfolio.
- Test: automated or manual verification step.

Keep examples generic. Document concrete UI structures, not the names of current Space Apps.
