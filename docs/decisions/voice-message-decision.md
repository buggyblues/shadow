# Voice Message Feature - Technical Decision Record

## Summary

实现类似微信的语音消息功能，支持 Web 和 Mobile 双端。

---

## Decisions

### D1: Audio Format

**Decision:** WebM (Opus codec)

**Rationale:**
- Opus 提供最佳压缩率和音质平衡
- WebM 格式现代浏览器广泛支持
- 移动端可通过 expo-av 录制后转换

**Note:** iOS 原生录制 AAC (m4a)，需要转换为 WebM 或保持双格式支持。

---

### D2: Maximum Recording Duration

**Decision:** 60 seconds

**Rationale:** 微信标准，足够覆盖大多数语音消息场景。

---

### D3: Voice Message UI

**Decision:** 固定动画（无波形图）

**Rationale:**
- 波形图复杂度高（服务端生成/存储/客户端渲染）
- 简化为固定动画（播放时显示声波动画）
- 降低实现成本，加快交付

**UI 设计：**
```
[播放按钮] [声波动画图标] [时长]
```
- 未播放：静态声波图标
- 播放中：声波动画（CSS/Reanimated 动画）
- 自己发送：右侧气泡
- 对方发送：左侧气泡

---

### D4: Unread Indicator (Red Dot)

**Decision:** 不实现

**Rationale:** 群聊场景追踪每个用户播放状态复杂度高，暂不实现。

---

### D5: Platform Priority

**Decision:** Web 和 Mobile 同时开发

**Rationale:** 双端用户都需要语音消息功能，UI 统一设计，技术实现分开。

---

### D6: Duration Storage

**Decision:** 数据库单独字段存储 duration

**Schema Changes:**
```sql
-- attachments 表新增字段
ALTER TABLE attachments ADD COLUMN voice_duration INTEGER;

-- dm_attachments 表删除，合并到 attachments
DROP TABLE dm_attachments;
```

**Rationale:**
- 单独字段类型安全，查询简单
- 只存 duration（整数秒），无 waveform
- 简化存储和检索逻辑

---

### D7: Speech-to-Text Integration

**Decision:** 可选转文字，客户端识别

**Rationale:**
- 语音消息有独立切换按钮（类似微信）
- 用户可选择发送纯语音或语音+文字
- 客户端使用现有 Typeless SDK 识别
- 后续可升级为服务端识别（OpenAI Whisper 等）

---

### D8: Message Bubble Layout

**Decision:** 微信风格

```
[播放按钮] [声波图标] [时长]
```

- 自己发送：右侧气泡
- 对方发送：左侧气泡

---

### D9: Background Playback

**Decision:** 支持后台播放

**Rationale:** 用户切换页面时语音继续播放，类似音乐播放器体验。

---

### D10: Audio Cache Strategy

**Decision:** 本地持久缓存

**Rationale:**
- 下载后保存到本地存储
- 再次播放直接读取本地文件
- 减少重复下载，提升体验

---

### D11: Permission Request Timing

**Decision:** 点击录音按钮时请求

**Rationale:** 用户明确意图时请求权限，体验更自然。

---

### D12: Cancel Recording Gesture

**Decision:** 完全对标微信

- 上滑取消录音
- 滑动到一定距离触发（避免误触）
- 松开前显示"松开取消"提示
- 滑动状态有视觉警告

---

### D13: Minimum Recording Duration

**Decision:** 1 秒

**Rationale:** 微信标准，太短录音 Toast 提示"录音时间太短"。

---

### D14: Recording UI

**Decision:** 遮罩层 + 中央大麦克风动画（微信风格）

显示内容：
- 录音时长计时器
- 麦克风脉冲动画
- "上滑可取消"提示
- 滑动取消时的警告状态

---

### D15: Speech-to-Text Toggle

**Decision:** 录音按钮旁单独切换按钮

**Rationale:**
- 客户端识别结果发送服务端存储
- 语音转文字功能保持独立，不影响纯语音消息
- 切换按钮状态决定是否同时发送文字版本

---

### D16: Upload API Flow

**Decision:** 两步上传（复用现有附件流程）

```
1. POST /api/media/upload → { attachmentId, url }
2. POST /api/channels/:id/messages → { content, attachments: [attachmentId] }
```

**Rationale:**
- 复用现有 MediaService 和附件上传逻辑
- 减少服务器改动，降低风险
- 需要确保权限校验（只有上传者可使用附件）

---

### D17: Playback Speed Control

**Decision:** 不实现

**Rationale:** 语音消息场景通常不需要变速播放，保持简单。

---

### D18: Global Audio Player Singleton

**Decision:** 全局单例播放器

**Behavior:**
- 新播放自动停止当前播放
- 播放状态通过 Zustand/Context 共享
- 支持后台播放（不随页面切换停止）

---

### D19: DM Voice Message Support

**Decision:** 支持 DM 语音消息

**Changes:**
- 删除 `dm_attachments` 表
- DM 语音消息统一存储到 `attachments` 表
- 通过 `dmMessageId` 字段关联
- 播放器组件复用 Channel 的实现

---

### D20: File Size and Compression

**Decision:** 限制时长，自动压缩

| 限制项 | 值 |
|-------|---|
| 最大时长 | 60 秒 |
| 自动压缩 | 是（Opus 32kbps） |
| 最大文件大小 | ~2MB（压缩后） |

**Rationale:**
- 只限制时长，不限制原始文件大小
- 上传前客户端自动压缩
- 压缩后预计 60 秒 ~240KB

---

### D21: File Storage Path

**Decision:** 按类型分组存储

```
/shadow/voice/{uuid}.{ext}
```

**Rationale:**
- voice 前缀方便清理和管理
- 不按频道分组（附件跨频道引用场景少）

---

### D22: Error Handling

**Decision:** 优雅降级

| 错误场景 | 处理 |
|---------|------|
| 格式转换失败 | 存储原格式，播放器兼容处理 |
| 音频文件损坏 | 上传时校验 duration > 0，损坏则拒绝 |
| 上传失败 | 客户端重试机制 |

---

### D23: Audio Compression Implementation

**Decision:** 客户端压缩

| 平台 | 压缩方案 |
|------|---------|
| Web | MediaRecorder + Opus 编码 |
| iOS | expo-av 录制时指定 Opus 格式 |
| Android | expo-av 录制时指定 Opus 格式 |

**如果客户端无法压缩：**
- 服务端使用 ffmpeg 压缩
- 压缩后替换原文件

---

### D24: E2E Test Coverage

| 场景 | 测试 |
|------|------|
| 上传音频文件 | ✅ |
| 发送带语音附件的消息 | ✅ |
| 获取消息包含 voice duration | ✅ |
| 权限校验（只有上传者可用） | ✅ |
| 格式转换（AAC→WebM） | ✅ |
| 超长音频（>60s）截断 | ✅ |
| 非音频文件伪装上传 | ✅ |
| DM 语音消息 | ✅ |

---

### D25: Implementation Order

1. **Phase 1:** 数据库 schema 变更 + 删除 dm_attachments
2. **Phase 2:** 服务端 duration 提取 + 格式转换
3. **Phase 3:** 语音消息播放器组件（Web + Mobile）
4. **Phase 4:** 移动端录音功能（expo-av）
5. **Phase 5:** Web 端录音功能（MediaRecorder）
6. **Phase 6:** 本地缓存机制
7. **Phase 7:** SDK/CLI 支持 + 语音转文字联动

---

## Technical Architecture

### Server Changes

1. **Schema Changes**
   - `attachments` 表新增 `voice_duration INTEGER` 字段
   - 删除 `dm_attachments` 表
   - 迁移现有 DM 附件到 `attachments`

2. **Duration Extraction**
   - 使用 `ffprobe` 或 `music-metadata` 提取时长
   - 上传时自动提取，存储到 `voice_duration`

3. **Format Conversion**
   - 新增 `AudioConverterService` 使用 ffmpeg 转换格式
   - iOS AAC → WebM 自动转换
   - 可选：压缩大文件

4. **Upload Permission Check**
   - 确保只有上传者可以使用 attachment 发送消息

### Web Implementation

1. **Recording:** MediaRecorder API
2. **Playback:** HTML5 Audio + 固定声波动画
3. **Cache:** IndexedDB 或 localStorage 存储音频文件

### Mobile Implementation

1. **Recording:** expo-av Audio.Recording API
2. **Playback:** expo-av Audio.Sound API + Reanimated 动画
3. **Cache:** FileSystem + AsyncStorage metadata

---

## Files to Modify/Create

### Server
- `apps/server/src/db/schema/attachments.ts` - 添加 voice_duration 字段
- `apps/server/src/db/schema/dm-attachments.ts` - **DELETE**
- `apps/server/src/services/media.service.ts` - 提取 duration + 格式转换
- `apps/server/src/services/audio-converter.service.ts` (NEW) - ffmpeg 格式转换
- `apps/server/src/db/migrations/` - 迁移脚本
- `apps/server/__tests__/voice-message-e2e.test.ts` (NEW) - E2E 测试

### SDK (TypeScript)
- `packages/sdk/src/types.ts` - ShadowAttachment 添加 voiceDuration

### SDK (Python)
- `packages/sdk-python/shadowob_sdk/types.py` - Attachment 添加 voice_duration

### CLI
- `packages/cli/src/commands/voice.ts` (NEW) - voice send 命令
- `packages/cli/src/index.ts` - 注册 voice 命令

### Web
- `apps/web/src/components/chat/voice-message-bubble.tsx` (NEW)
- `apps/web/src/components/chat/voice-recorder.tsx` (NEW)
- `apps/web/src/hooks/use-voice-recorder.ts` (NEW)
- `apps/web/src/hooks/use-voice-player.ts` (NEW)
- `apps/web/src/lib/voice-cache.ts` (NEW)
- `apps/web/src/stores/voice-player.store.ts` (NEW) - 全局播放器状态
- `apps/web/src/components/chat/message-input.tsx` - 集成录音按钮

### Mobile
- `apps/mobile/src/components/chat/voice-message-bubble.tsx` (NEW)
- `apps/mobile/src/components/chat/voice-recorder-modal.tsx` (NEW)
- `apps/mobile/src/hooks/use-voice-recording.ts` (NEW)
- `apps/mobile/src/hooks/use-voice-player.ts` (NEW)
- `apps/mobile/src/lib/voice-cache.ts` (NEW)
- `apps/mobile/src/stores/voice-player.store.ts` (NEW) - 全局播放器状态
- `apps/mobile/src/components/chat/chat-composer.tsx` - 集成录音按钮

### Desktop
- 无新增文件，复用 Web 组件

### Website Docs
- `website/docs/en/api-doc/media.md` - 添加 voice duration 说明
- `website/docs/en/api-doc/messages.md` - 添加语音消息示例
- `website/docs/zh/api-doc/media.md` - 中文同步
- `website/docs/zh/api-doc/messages.md` - 中文同步

### Shared
- `packages/shared/src/types/message.types.ts` - 添加 voiceDuration 类型

---

## Open Questions (Future Iteration)

1. 语音消息编辑/撤回后重新录制？
2. 语音消息转发？
3. 语音消息下载保存到本地？
4. 服务端语音转文字？

---

**Created:** 2024-03-30
**Updated:** 2024-03-31
**Status:** Approved (Simplified)
**Next Step:** Phase 1 - Database Schema Changes