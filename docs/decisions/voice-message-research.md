# Voice Message Technical Research

## Overview

调研语音消息功能的实现方案，对标微信语音消息交互体验。

## Current Implementation

### 1. Mobile Voice Input (STT - Speech to Text)

**已有语音转文字功能，不是语音消息：**

| 文件 | 功能 |
|------|------|
| `apps/mobile/src/hooks/use-voice-input.ts` | 统一语音输入 hook，自动检测 Expo Go 或生产环境 |
| `apps/mobile/src/hooks/use-typeless-voice-input.ts` | Typeless SDK 实现的语音识别 |
| `apps/mobile/src/utils/voice-processor.ts` | 语音文本后处理（去语气词、自我纠正、列表格式化） |
| `apps/mobile/src/components/chat/typeless-mic-button.tsx` | 语音输入按钮（长按说话，松开转文字） |

**技术栈：**
- Typeless SDK（云端语音识别服务）
- 支持实时语音转文字
- 带脉冲动画的录音按钮

### 2. Message & Attachment System

**消息数据结构：**

```typescript
// packages/shared/src/types/message.types.ts
interface Message {
  id: string
  content: string
  channelId: string
  authorId: string
  attachments?: Attachment[]
  reactions?: ReactionGroup[]
  metadata?: MessageMetadata  // 可扩展元数据
}

interface Attachment {
  id: string
  messageId: string
  filename: string
  url: string
  contentType: string  // audio/mp4, audio/mpeg 等
  size: number
  width: number | null
  height: number | null
}
```

**附件表（server）：**
```typescript
// apps/server/src/db/schema/attachments.ts
attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').references(() => messages.id),
  filename: varchar('filename', { length: 255 }),
  url: text('url'),
  contentType: varchar('content_type', { length: 100 }),
  size: integer('size'),
  width: integer('width'),    // 音频不需要
  height: integer('height'),  // 音频不需要
  createdAt: timestamp('created_at'),
})
```

### 3. Audio Rendering (Web)

**已有音频播放器：**
```typescript
// apps/web/src/components/workspace/renderers/AudioRenderer.tsx
// 简单的 HTML5 audio 元素播放器
// 用于 workspace 文件预览，不是聊天消息场景
```

### 4. Media Upload

**MinIO/S3 存储：**
```typescript
// apps/server/src/services/media.service.ts
- upload(file, filename, contentType) → { url, size }
- 支持任意 contentType，包括 audio/*
- 存储路径：/shadow/uploads/{uuid}.{ext}
```

## Gap Analysis (缺失功能)

| 功能 | 状态 | 说明 |
|------|------|------|
| 语音录制 | ❌ 缺失 | 需要实现录音并保存为音频文件 |
| 长按录音交互 | ❌ 缺失 | 微信风格：长按开始录音，松开发送 |
| 滑动取消 | ❌ 缺失 | 上滑取消录音，带提示动画 |
| 录音时长显示 | ❌ 缺失 | 实时显示录音时长 |
| 语音消息播放器 | ❌ 缺失 | 波形显示、进度条、播放按钮 |
| 未读语音提示 | ❌ 缺失 | 红点标记未播放语音 |
| 语音消息上传 | ✅ 可用 | 现有附件上传流程支持 audio/* |
| 语音消息存储 | ✅ 可用 | 附件表可存储音频文件 |

## Reference: WeChat Voice Message UX

### 录制交互
1. 长按麦克风按钮开始录音
2. 录音中显示时长计时器
3. 上滑显示"松开取消"提示
4. 松开：发送 或 取消
5. 最短时长限制（约 1 秒）
6. 最长时长限制（约 60 秒）

### 播放交互
1. 点击播放按钮播放语音
2. 显示波形或进度条
3. 播放中显示进度
4. 点击暂停
5. 继续播放从暂停位置继续

### 消息显示
1. 语音消息气泡样式（圆角气泡 + 播放按钮 + 时长）
2. 未播放显示红点
3. 自己发送的语音：右侧气泡，绿色/蓝色
4. 对方发送的语音：左侧气泡，白色

## Technical Options

### Option A: 纯本地录制 + 上传

**方案：**
- 使用 `expo-av` 或 `react-native-audio-api` 录制本地音频
- 录制完成后上传到 MinIO
- 作为 attachment 发送消息

**优点：**
- 完整控制录音流程
- 支持离线录制（本地缓存）
- 音频质量可控

**缺点：**
- 需要处理权限
- 上传延迟（录音结束后需要等待上传）
- 本地存储空间占用

**技术栈：**
```typescript
// expo-av Audio API
import { Audio } from 'expo-av'

const recording = new Audio.Recording()
await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
await recording.startAsync()
// ...
await recording.stopAndUnloadAsync()
const uri = recording.getURI()  // local file URI
```

### Option B: 流式上传（边录边传）

**方案：**
- 实时录制音频流
- 分块上传到服务器
- 服务器合并为完整音频文件

**优点：**
- 录音结束即可发送（无需等待上传）
- 更快的用户体验

**缺点：**
- 实现复杂度高
- 需要服务器支持流式接收
- 网络问题可能导致部分丢失

**技术栈：**
- WebSocket 或 HTTP chunked upload
- WebRTC MediaRecorder（Web 端）
- Native Audio Stream API（移动端）

### Option C: WebRTC 实时语音

**方案：**
- 使用 WebRTC 进行实时语音通话
- 语音消息作为通话片段

**优点：**
- 高质量音频
- 支持实时通话扩展

**缺点：**
- 过度设计（语音消息不需要实时通话）
- 实现复杂度最高
- 需要 SFU 服务器

**结论：** 不推荐，语音消息场景不需要 WebRTC

### 推荐：Option A（本地录制 + 上传）

微信也是采用类似方案：本地录制完成后上传。

## Key Technical Decisions (需确认)

### Q1: 音频格式选择

**选项：**
| 格式 | 优点 | 缺点 |
|------|------|------|
| **AAC (m4a/mp4)** | iOS/Android 原生支持，压缩率高，质量好 | Web 播放需要支持 |
| **MP3** | 广泛兼容 | 移动端录制支持较弱 |
| **Opus (ogg/webm)** | 最佳压缩率，开源 | iOS Safari 支持有限 |
| **WAV** | 无压缩，最高质量 | 文件大，不推荐 |

**推荐：** AAC（iOS 默认）或 Opus（Android 推荐）

### Q2: 最长录音时长

微信限制：60 秒

**选项：**
- 30 秒（短语音）
- 60 秒（微信标准）
- 120 秒（长语音）
- 无限制

### Q3: 波形显示方式

**选项：**
| 方案 | 优点 | 缺点 |
|------|------|------|
| **静态波形图** | 预生成 PNG/SVG，加载快 | 不反映实际播放进度 |
| **动态波形动画** | 播放时实时动画，视觉效果好 | 实现复杂，性能开销 |
| **简化进度条** | 实现简单，足够实用 | 视觉效果一般 |

**推荐：** 简化进度条 + 播放按钮（先实现基础版本）

### Q4: 语音消息 metadata

需要在消息或附件 metadata 中存储：
- 录音时长（duration）
- 是否已播放（played）
- 波形数据（可选，如果用动态波形）

### Q5: Web 端实现

Web 端需要：
- MediaRecorder API 录制音频
- Web Audio API 播放和波形
- 与移动端统一的 UI 设计

## Next Steps

1. 确认上述问题答案
2. 编写技术方案文档
3. 设计数据库扩展（metadata 字段）
4. 实现移动端录音功能
5. 实现语音消息播放器
6. 实现 Web 端对应功能
7. 测试和优化

---

**Created:** 2024-XX-XX
**Author:** Xiao Zha
**Status:** Research Complete, Pending Q&A