# 移动端 Bug 评审与 TODO（2026-06-20）

本文记录来自「移动端 Bug 记录」频道的第一轮与第二轮评审结果，用于后续继续补充复现细节、验收标准与实现状态。

## 背景

- 目标范围：`apps/mobile`，必要时参考 `apps/web` 的已有实现。
- 记录时间：2026-06-20。
- 当前目标：先把高优先级阻塞项和明确 UI 缺陷拆成可执行 TODO；细节不足的条目先保留为待确认。
- 注意：所有移动端 UI 文案改动必须走 `apps/mobile/src/i18n/locales/*.json`。

## 已补充澄清

1. 「聊天右滑过程会下坠」指聊天页滑动退出/返回时，整个聊天消息列表向下坠。
2. 「无法添加应用」指两个入口都需要处理：发现页 App 详情无法添加，服务器内也缺少或无法完成添加应用入口。
3. 「右上角按钮的可见性」修正为首页左上角按钮可见性：有时候背景、封面或毛玻璃效果导致按钮看不清。
4. 「服务商缺少私有状态」修正为参考 Web：私有频道和私有服务器需要显示上锁角标。
5. 「聊天胶囊 margin / 毛玻璃效果」更新为首页和聊天胶囊都需要使用 `expo-blur` 做稳定的毛玻璃表现。
6. 「已经是好友，直接聊天」更新为：如果双方已经是好友，进入对方主页时直接显示私信聊天入口。
7. 「右下角搜索记录最近去过的频道/Inbox」更新为：点击右下角搜索后，先展示常去频道、Inbox、应用等快捷入口，并把访问状态持久化在本地。
8. 「ActionSheet / Panel / Popupmenu」更新为 BottomSheet 基础组件重构：当前实现体验较差，优先基于已安装的 `@gorhom/bottom-sheet` v5 收敛，必要时参考或引用官方推荐模式。

## 优先级总览

| 优先级 | 事项 | 当前判断 |
| --- | --- | --- |
| P1 | 聊天滑动退出时消息列表下坠 | 高频核心体验缺陷，需要优先复现和修复。 |
| P1 | 移动端无法添加应用 | 阻塞 Server App 使用路径，需要补齐发现页和服务器内入口。 |
| P1 | BottomSheet 基础组件重构 | 当前 Sheet/键盘/手势实现复杂且不稳定，影响邀请、表单、菜单等多个路径。 |
| P2 | 首页左上角按钮看不清 | 视觉可用性问题，受封面/毛玻璃/主题影响。 |
| P2 | 首页和聊天胶囊毛玻璃效果 | 统一使用 `expo-blur`，并处理 Android 与动态内容渲染限制。 |
| P2 | 私有频道/服务器缺上锁角标 | 与 Web 行为不一致。频道已有部分实现，服务器侧需补齐。 |
| P2 | 搜索框、聊天输入框、编辑频道输入框居中/多行 | 输入控件视觉专项，建议统一修。 |
| P2 | 邀请成员弹窗 | 需要复核频道/服务器邀请路径、键盘和底部操作栏。 |
| P2 | 右下角搜索常去入口持久化 | 空查询时优先展示常去频道、Inbox、应用等，减少用户到处翻找。 |
| P2 | 好友主页直接私信入口 | 关系态明确后直接进入 DM，减少从成员页/Profile 到聊天的绕路。 |
| P3 | 点按录音 | 交互改版，需要先定义完整状态机。 |
| P3 | 服务器折叠 | 频道分组已有折叠；服务器 rail 折叠是新增交互。 |

## P1 事项

### 1. 聊天滑动退出时消息列表下坠

**现象**

在聊天页滑动退出/返回过程中，整个聊天消息列表出现异常向下位移。

**初步代码落点**

- `apps/mobile/app/(main)/servers/[serverSlug]/channels/[channelId].tsx`
  - inverted `FlatList`：消息列表主体。
  - `contentContainerStyle={styles.messageList}`。
  - 页面内还有多个 `Modal animationType="slide"`，但本项重点先看路由返回手势与列表布局交互。

**待确认复现**

- iOS 系统右滑返回、Android 返回手势、还是应用内返回按钮均会触发？
- 下坠是否只在有键盘/底部 composer 打开时出现？
- 是否仅发生在长消息列表、空列表、含图片/语音附件、或正在加载更多时？

**验收标准**

- iOS/Android 滑动返回或退出动画过程中，消息列表不整体下移。
- 不露出异常空白区域。
- composer、键盘安全区和消息列表不发生错位。
- 退出取消后页面能回到原布局。

**建议测试**

- 移动端路由集成测试或手工设备验证。
- 至少覆盖：普通文本频道、空频道、长列表、键盘打开、附件消息。

### 2. 移动端无法添加应用

**现象**

移动端添加 Server App 的路径不完整：发现页 App 详情无法添加，服务器内也缺少或无法完成添加应用入口。

**Web 参考**

- `apps/web/src/pages/server-app-directory-detail.tsx`
- `apps/web/src/components/server/server-apps-settings-panel.tsx`
- 服务端安装接口：`POST /api/servers/:serverId/apps/catalog/:catalogEntryId/install`

**移动端现状**

- `apps/mobile/app/(main)/discover.tsx` 已有 Server App 目录数据和 App 卡片。
- 移动端发现页当前主要打开 WebView 详情，未形成原生安装流程。
- 首页快捷区能展示已安装 App，但缺少完整安装入口。

**实现范围**

- 发现页 App 详情：支持选择目标服务器并安装。
- 服务器内入口：在服务器首页、服务器设置或 App 快捷区附近提供明确的添加应用入口。
- 安装成功后刷新：
  - `home-unified-server-apps`
  - `home-unified-global-search-data`
  - 当前服务器首页快捷区

**验收标准**

- 用户能从发现页 App 详情把 App 安装到有权限管理的服务器。
- 用户能从服务器内找到添加应用入口。
- 安装成功后 App 出现在移动端服务器首页快捷区。
- 已安装 App 可打开。
- 无权限用户看到明确不可安装状态。

**待确认**

- 移动端 App 详情是否必须原生化，还是允许 WebView 详情页调用移动端安装 bridge？
- 服务器内入口放在首页 App 快捷区、服务器设置，还是二者都要？

### 3. BottomSheet 基础组件重构

**现象**

当前 BottomSheet / ActionSheet / Panel / Popup menu 的体验不稳定，尤其是键盘、拖拽关闭、底部安全区、长列表滚动和输入框自动聚焦混在一起时容易出现错位或手势冲突。

**当前代码落点**

- `apps/mobile/src/components/ui/interactive-sheet.tsx`
  - 已经引入 `@gorhom/bottom-sheet` 的 `BottomSheetModal`、`BottomSheetView`、`BottomSheetBackdrop`。
  - 非输入类 sheet 已走 `BottomSheetModal`。
  - 但带 `autoFocusRef` 的输入类 sheet 会切到自制 `Modal + Animated + PanResponder + Keyboard` 分支。
- `apps/mobile/app/_layout.tsx`
  - 已经包了 `GestureHandlerRootView` 和 `BottomSheetModalProvider`。
- `apps/mobile/package.json`
  - 已安装 `@gorhom/bottom-sheet`、`react-native-gesture-handler`、`react-native-reanimated`、`@shopify/flash-list`。

**推荐方案**

优先收敛到已安装的 `@gorhom/bottom-sheet` v5，不再继续扩大自制 `Modal + PanResponder` 分支。

- `InteractiveSheet` 默认使用 `BottomSheetModal`。
- 表单输入使用 `BottomSheetTextInput`，或把官方 `BottomSheetTextInput` 的 focus / blur 处理复制到项目内的 `TextField` 适配层。
- 长列表使用 `BottomSheetScrollView`、`BottomSheetFlatList` 或项目已安装的 FlashList 集成方式。
- 键盘能力优先使用官方 props：
  - `keyboardBehavior`
  - `keyboardBlurBehavior`
  - `enableBlurKeyboardOnGesture`
  - `android_keyboardInputMode`
- 需要 footer 的场景统一定义底部安全区和键盘避让，不在各页面重复 hardcode。

**开源/官方参考**

- `@gorhom/bottom-sheet` 官方文档：https://gorhom.dev/react-native-bottom-sheet/
- Keyboard handling：https://gorhom.dev/react-native-bottom-sheet/keyboard-handling

**验收标准**

- 邀请成员、编辑频道、添加好友、创建菜单、长按菜单等 sheet 都使用同一套基础能力。
- iOS/Android 键盘弹出、拖拽关闭、点击蒙层关闭、返回键关闭都稳定。
- Sheet 内长列表可滚动，拖拽 sheet 与滚动列表不互相抢手势。
- 输入框自动聚焦不导致 sheet 跳动或遮挡 footer。
- 没有新的 `window.alert` / `confirm` / `prompt` 或浏览器式 modal API。

## P2 事项

### 4. 首页左上角按钮看不清

**现象**

首页左上角创建按钮在某些服务器封面、浅色/深色主题或毛玻璃叠加下对比度不足。

**代码落点**

- `apps/mobile/app/(main)/(tabs)/index.tsx`
  - `unifiedRailCreateButton`
  - 图标颜色当前跟随 `homePalette.text`
- `apps/mobile/src/features/home/home.styles.ts`
  - `unifiedRailCreateButton`
  - `unifiedRailCreateTouch`

**修复方向**

- 增加稳定的前景色、描边和阴影策略。
- 对封面背景下的按钮增加最小对比保障。
- 不只换单个颜色值，避免在另一套主题里反向失效。

**验收标准**

- 浅色主题、深色主题、无封面、有亮色封面、有暗色封面下均清晰可见。
- 图标和按钮轮廓都可辨识。
- 点击区域不变小，不影响创建菜单定位。

### 5. 首页和聊天胶囊毛玻璃效果（expo-blur）

**现象**

首页和聊天胶囊需要统一毛玻璃效果，避免不同页面各自叠透明色、阴影和边框后出现质感不一致、按钮看不清或 Android 表现退化。

**当前代码落点**

- `apps/mobile/package.json`
  - 已安装 `expo-blur`。
- `apps/mobile/src/features/home/components.tsx`
  - `FrostedBackdrop` 已使用 `BlurView`。
- `apps/mobile/app/(main)/(tabs)/_layout.tsx`
  - 底部 tab 胶囊和右下角搜索按钮已经使用 `BlurView`。
- `apps/mobile/src/features/home/overlays.tsx`
  - 搜索/命令面板相关浮层已经使用 `BlurView`。
- `apps/mobile/src/components/chat/chat-composer.tsx`
  - 当前未看到聊天输入胶囊直接使用 `BlurView`，需要补齐或复用统一 Glass Surface。

**实现方向**

- 首页相关胶囊继续走 `expo-blur`，但把强度、tint、overlay、border、shadow 规则收敛成统一 token 或组件。
- 聊天 composer 胶囊补上与首页一致的毛玻璃层级。
- `BlurView` 应渲染在动态内容之后，避免官方文档提到的动态列表先渲染时 blur 不更新问题。
- Android 上明确是否开启 `experimentalBlurMethod`；如不开启，则需要半透明背景 fallback，避免表现像“脏灰块”。
- Android / iOS 分别校准 `intensity` 和 `blurReductionFactor`，不要只按 iOS 观感调。

**验收标准**

- 首页底部胶囊、右下角搜索按钮、聊天输入胶囊的毛玻璃观感一致。
- 浅色/深色主题、亮/暗服务器封面下都能保持文字和图标可读。
- Android 不出现完全失效、异常闪烁或动态内容不更新的问题。
- 胶囊内文本、图标、按钮 hover/pressed 状态不被 blur 覆盖。

**官方参考**

- Expo BlurView：https://docs.expo.dev/versions/latest/sdk/blur-view/

### 6. 私有频道/服务器上锁角标

**Web 参考**

- 服务器 rail：`apps/web/src/components/server/server-sidebar.tsx`，私有服务器头像右上角显示 lock badge。
- 频道行：`apps/web/src/components/channel/channel-sidebar.tsx`，私有频道标题旁显示 Lock。

**移动端现状**

- 频道列表已经有私有频道 Lock：
  - `apps/mobile/src/features/home/components.tsx`
  - `UnifiedChannelRow` 中 `channel.isPrivate` 后显示 `Lock`。
- `ServerEntry.server.isPublic` 已存在：
  - `apps/mobile/src/features/home/types.ts`
- 服务器 rail 尚未看到与 Web 一致的 lock badge。

**实现范围**

- 服务器 rail item：`server.isPublic === false` 时显示上锁角标。
- 搜索结果中的服务器候选也应显示私有状态，避免从搜索进入时丢失语义。
- 如果服务器标题区需要展示私有状态，需与设计确认是否也加。

**验收标准**

- 私有服务器在移动端 rail 显示 lock badge。
- 私有频道在移动端频道列表继续显示 lock。
- 公开服务器/频道不显示 lock。
- 搜索结果中私有服务器、私有频道语义一致。

### 7. 输入框居中、搜索框居中、聊天多行

**相关原始记录**

- 「输入框居中问题，编辑频道不居中」
- 「搜索框输入过程中文本不居中」
- 「聊天多行」

**初步代码落点**

- 通用输入：
  - `apps/mobile/src/components/ui/index.tsx`
  - `TextField`
  - `SearchField`
- 聊天输入：
  - `apps/mobile/src/components/chat/chat-composer.tsx`
  - `styles.inputBar`
  - `styles.inputWrapper`
  - `styles.textInput`
- 编辑频道：
  - `apps/mobile/src/features/home/overlays.tsx`
  - 编辑频道 Sheet 内的 `TextField`

**修复方向**

- 先统一 `TextField` / `SearchField` 的单行垂直对齐。
- 再单独处理聊天 composer 的多行高度增长规则。
- 避免通过单个页面 hardcode padding 导致其他输入框错位。

**验收标准**

- 搜索框输入前、输入中、清空后文本都视觉居中。
- 编辑频道输入框文字垂直居中。
- 聊天输入一行时居中，多行时自然向上扩展，不挤压左右按钮。
- 多行输入达到最大高度后可滚动或保持稳定高度。

### 8. 邀请成员弹窗

**现状**

移动端有频道成员页、频道邀请面板和服务器邀请页。

**代码落点**

- 频道成员/邀请：
  - `apps/mobile/app/(main)/servers/[serverSlug]/channels/[channelId].tsx`
  - `showMemberPanel`
  - `memberPanelMode`
  - `inviteMode`
- 独立成员/邀请页：
  - `apps/mobile/app/(main)/servers/[serverSlug]/channel-members.tsx`
  - `apps/mobile/app/(main)/servers/[serverSlug]/invite.tsx`

**需要复核**

- 键盘打开后搜索框、候选列表、底部按钮是否被遮挡。
- 频道邀请和服务器邀请是否语义清楚。
- 成员与 Buddy 两个 tab 切换后候选和提交按钮状态是否正确。
- 已在频道/服务器内的人是否被正确过滤。

**验收标准**

- 搜索、选择、取消、提交、返回都稳定。
- 键盘弹出时底部操作栏可见。
- 无候选、离线 Buddy、已选中状态都有清晰反馈。

### 9. 右下角搜索常去入口持久化

**现象**

右下角搜索不是只做文本搜索。用户点击后应先看到常去频道、Inbox、应用等快捷入口，减少在服务器、频道、DM、App 之间来回翻找。

**当前代码落点**

- `apps/mobile/src/features/home/overlays.tsx`
  - 命令/搜索面板展示候选列表。
- `apps/mobile/app/(main)/(tabs)/_layout.tsx`
  - 右下角搜索按钮触发 `requestHomeCommandPalette()`。
- `apps/mobile/src/stores/channel-sort.store.ts`
  - 已有 `channel-sort-storage`，用 AsyncStorage 持久化频道 `lastAccessedAt`。
- `apps/mobile/src/hooks/use-channel-sort.ts`
  - 已能读取频道访问时间，但模型只覆盖频道，不覆盖 Inbox / App。

**实现方向**

- 新增或扩展一个本地 recent/frequent store，建议独立于频道排序，避免把“排序偏好”和“全局常去入口”绑死。
- 记录结构建议：
  - `kind`: `channel` / `inbox` / `app` / `server` / `workspace`
  - `id`
  - `serverId` 或上下文 id
  - `label`
  - `lastAccessedAt`
  - `openCount`
- 每次打开频道、Inbox、App、Workspace 时更新本地记录。
- 空查询时展示“常去”候选；有输入时仍展示普通搜索结果。
- 记录需要按当前登录用户隔离，登出或切号时不要串数据。
- 设置上限，例如最近 30-50 条，避免 AsyncStorage 无限增长。

**验收标准**

- 点击右下角搜索，不输入内容时优先看到常去频道、Inbox、应用等。
- 点击候选可直接跳转到对应页面。
- 重启 App 后常去记录仍存在。
- 切换账号后不显示上一个账号的常去记录。
- 删除/失权/卸载的频道或 App 不再展示，或点击时能被安全清理。

### 10. 好友主页直接显示私信聊天入口

**现象**

如果已经是好友，进入对方主页时应该直接显示私信聊天入口，而不是只显示“已是好友”或让用户再去其他地方找 DM。

**当前代码落点**

- `apps/mobile/app/(main)/profile/[userId].tsx`
  - 已查询 `/api/friends` 和 `/api/friends/sent`。
  - 已计算 `isFriend`。
  - 当前好友态按钮显示 `friends.alreadyFriend`，且因为 `addFriendDisabled` 被禁用。
- 可复用 DM 能力：
  - `apps/mobile/app/(main)/(tabs)/index.tsx` 已调用 `POST /api/channels/dm`。
  - `apps/mobile/app/(main)/friends.tsx` 已有发起私信逻辑。

**实现方向**

- `isFriend === true` 时 Profile 主按钮改成“私信/聊天”入口。
- 点击后调用 `POST /api/channels/dm`，复用已有 DM 或创建 DM，再跳转到聊天页。
- 非好友继续显示添加好友/请求中状态。
- 自己的主页不显示私信或添加好友入口。
- Buddy / agent 关系如果有独立规则，需要与现有 Direct Contact 逻辑保持一致。

**验收标准**

- 已是好友时，Profile 中可直接进入私信。
- 已有 DM 时复用现有 DM，不重复创建。
- 非好友不会误显示可直接聊天。
- 请求中、自己、Bot/Buddy 等状态按钮语义清楚。
- 新增按钮文案走 `apps/mobile/src/i18n/locales/*.json`。

## P3 / 产品增强

### 11. 点按录音

当前语音输入代码使用 `onPressIn/onPressOut`，即按住录音。改成点按录音属于交互模型调整。

**需要定义**

- 点按开始，是否再次点按停止？
- 停止后是自动发送，还是进入预览态？
- 如何取消？
- 最短录音时长是多少？
- 权限失败、录音失败、后台切换时如何处理？

**验收标准草案**

- 点按开始录音，录音态明确。
- 再次点按或点击停止按钮结束录音。
- 用户可以发送或取消。
- 过短录音有提示，不发送空语音。

### 12. 服务器折叠

**现状**

频道分组已经支持折叠：

- `apps/mobile/app/(main)/(tabs)/index.tsx`
- `collapsedHomeGroups`
- `UnifiedChannelGroup`

服务器 rail 折叠尚未看到对应交互。

**待设计**

- 折叠服务器 rail 后，入口放在哪里？
- 折叠状态是否持久化？
- 是否影响 DM rail？
- 折叠后如何保证创建按钮、搜索和未读仍可访问？

## 视觉质量专项

以下来自第一条合并消息，其中毛玻璃和 BottomSheet 已拆成独立 TODO；剩余视觉项建议作为同一轮 UI polish 处理，不拆散到多个小 PR：

- 聊天胶囊 margin：和聊天 composer 毛玻璃一起处理。
- Popup menu：与 BottomSheet / ActionSheet / Panel 基础组件收敛保持一致。
- 首页左上角按钮、胶囊阴影、边框、pressed 状态需要一起回归。

**建议方式**

- 先截取当前移动端首页、聊天页、成员/邀请页、搜索弹层、长按菜单。
- 对照 `docs/design-system/shadow-ui/DESIGN.mobile.md`。
- 一次性统一 spacing、背景透明度、阴影和边框，不逐个页面临时修补。

## 待补充细节

请继续在这里补充：

- 设备型号 / 系统版本。
- 复现路径。
- 预期行为。
- 实际行为。
- 截图或录屏。
- 是否只在浅色/深色主题出现。
- 是否只在某个服务器、频道类型或权限状态出现。

## 实施建议

1. 先修 P1：聊天退出下坠、添加应用流程、BottomSheet 基础组件收敛。
2. 再修 P2 中影响全局可用性的项：首页左上角按钮、首页/聊天胶囊毛玻璃、私有 lock badge、输入框对齐。
3. 右下角搜索常去入口和好友主页私信入口属于明确产品增强，可以在基础 UI 稳定后并行做。
4. 邀请成员弹窗与视觉质量专项需要跟随 BottomSheet 重构一起做设备回归。
5. P3 项需要先补产品决策，再进入实现。

## 验证建议

- `pnpm --filter @shadowob/mobile test`
- `pnpm --filter @shadowob/mobile typecheck`
- `pnpm --filter @shadowob/mobile lint`
- 涉及 UI 的改动需要真机或模拟器手工验证 iOS/Android。
- 新功能路径（添加应用、成员聊天入口）应补移动端路由/组件测试；如引入新产品功能，后续补 E2E。
