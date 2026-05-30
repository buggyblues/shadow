# 语音消息产品系统设计与实施规划

状态：Draft
日期：2026-05-30
适用范围：Shadow Web、Mobile、Desktop Web 容器、OpenClaw ShadowOB 插件、Hermes ShadowOB 插件、TypeScript SDK、Python SDK、CLI/connector skill 文档。

## 1. 目标

Shadow 增加一等语音消息能力，而不是把音频文件当普通附件展示。

- Web / Mobile 支持在频道、DM、线程中发送和接收语音消息。
- 交互参考用户提供的稿件：输入区可进入录音状态，支持取消、发送、录音时长/声波反馈；消息气泡展示时长、真实波形、播放进度和播放状态。只参考交互，不照搬视觉设计。
- 支持逐用户播放状态：当前用户未听的语音消息显示未听红点，播放后跨设备消失。
- 支持真实波形：客户端录制时生成 waveform peaks；runtime/外部音频由服务端异步兜底生成。
- 支持用户可见转文字：语音消息可展示转写文本，客户端和服务端转写都进入统一状态模型。
- OpenClaw / Hermes 等 Buddy runtime 能接收用户语音消息，并能发送语音消息。
- 复用现有私有媒体、消息、附件、签名访问和 channel/DM 统一模型，不引入旧 DM 独立链路。

非目标：

- 不做实时语音频道或语音通话；`docs/api/voice-channels.md` 的实时语音频道是另一类能力。
- 不做逐字时间轴、卡拉 OK 高亮或音频剪辑编辑。
- 不做面向所有群成员的已读详情弹窗；V1 只要求当前用户未听状态和必要的作者侧聚合计数。

## 2. 当前系统基线

代码现状支持这次能力的基础设施：

- DM 已统一为私有 channel：消息、附件、反应、媒体鉴权和 WebSocket 都走普通 channel/message 路径。新方案不再使用 `/api/dm/*`、`dmMessageId` 或 `dm_attachments`。
- 服务端已有 `messages` + `attachments` 表，附件通过 `/api/attachments/:id/media-url` 获取短期签名 URL，下载仍在应用授权后面。
- `/api/media/upload` 已支持带 `messageId` 上传并创建附件记录，且会校验上传者只能给自己的消息补附件。
- Web / Mobile 当前把图片附件单独渲染，其他附件渲染为文件卡；还没有语音消息气泡和播放器。
- Mobile 现有 `TypelessMicButton` / `useVoiceInput` 是语音转文字，不是语音消息。
- OpenClaw ShadowOB 已有附件入站下载和出站上传能力；Hermes adapter 已能把 `audio/*` 映射到 `MessageType.AUDIO`，并有 `send_voice` 钩子，但目前缺少 Shadow 语音消息语义、时长和专门 action/metadata。

## 3. 产品行为

### 3.1 发送

Web / Mobile 的 composer 增加语音录制入口：

- 文本为空时显示麦克风入口；文本或待发送附件存在时保留发送按钮。
- 按住/点击麦克风请求麦克风权限并开始录音。Mobile 默认长按；Web 支持 pointer 长按，同时提供点击开始/点击结束的无障碍 fallback。
- 录音中 composer 切到录音态：取消按钮、时长、声波/音量动画、发送按钮；此状态替代输入栏，不显示附件预览。
- 向取消区域滑动或点击取消，丢弃本地录音。
- 松开发送或点击发送后停止录音、校验时长、上传并立即发出消息；不会进入“待发送附件”列表，也不需要用户再点一次普通发送按钮。
- 最短时长 1 秒；短于 1 秒提示“录音时间太短”。
- 最长时长 60 秒；到达上限自动停止并进入可发送状态。
- 上传中保留本地 optimistic 气泡，失败可重试或删除。

### 3.2 接收与播放

语音消息以独立气泡渲染：

- 自己发送的消息靠右，对方/Agent 消息靠左，沿用现有消息气泡和主题系统。
- 气泡显示时长、播放/暂停入口、真实波形和播放进度。
- 当前用户收到的未听语音显示红点；点击播放后立即清除本地红点，并向服务端上报播放状态，跨端同步。
- 自己发送的语音不显示未听红点；可显示轻量聚合状态，例如“已播放 3”，但不在 V1 展开成员明细。
- 全局单例播放器：开始播放一条语音时自动停止正在播放的其他语音。
- 支持点击/拖动波形跳转，移动端拖动时要避免和消息列表滚动手势冲突。
- 缓存已下载音频：Web 用 Cache API 或 IndexedDB，Mobile 用 FileSystem + AsyncStorage 元数据。
- 语音消息可在 channel、DM、thread 中一致渲染。

### 3.3 波形

波形是语音消息的一等展示数据：

- 客户端录音时从 PCM/音量采样生成 64 个归一化 peaks，范围 `0..100`。
- 播放时用同一组 peaks 渲染静态波形，并用播放进度填充已播放部分。
- 上传缺少 waveform 的音频时，服务端异步生成 peaks；生成完成后广播 `message:updated`。
- 如果 waveform 还未生成，客户端显示 skeleton 波形，不退回普通文件卡。

### 3.4 转文字

语音转文字作为语音消息能力，不再只属于 Mobile 文本输入：

- Web 录音发送时，如果浏览器支持 `SpeechRecognition` / `webkitSpeechRecognition`，发送端会同步采集识别文本，并随语音消息提交为 `source = client` 的 transcript。
- Mobile 现有 STT 继续作为文字输入能力存在；语音消息发送端不强制打断录音体验去展示转写。没有客户端 transcript 时，服务端按配置自动兜底转写。
- 服务端转写由 `VOICE_TRANSCRIPT_PROVIDER`、`VOICE_TRANSCRIPT_API_KEY`、`VOICE_TRANSCRIPT_MODEL` 等环境变量启用；启用后无客户端 transcript 的语音消息会进入 `pending -> processing -> ready/failed` 状态。
- 接收端默认折叠转写，点击展开；短语音可在空间允许时展示一行摘要。
- 转写文本可被复制、搜索和 runtime 读取，但必须遵守频道/DM 权限。Buddy runtime 收到 ready transcript 的语音消息时，把 transcript 当作可回复的文本上下文，而不是只看到媒体附件占位。
- 用户关闭语音转写时，不阻塞纯语音消息发送。

### 3.5 通知与摘要

消息 `content` 可继续使用 `\u200B` 或服务端内部 fallback，不把英文硬编码展示给用户。通知、空内容摘要和可访问性文案由 Web/Mobile i18n 根据附件 `kind = "voice"` 生成。

## 4. 数据模型

语音消息是“带语音附件的普通消息”，不是新的 message 表或 message kind。

### 4.1 Attachment 扩展

`attachments` 增加语音所需字段：

```ts
type AttachmentKind = 'file' | 'image' | 'voice'

interface Attachment {
  id: string
  messageId: string
  filename: string
  url: string
  contentType: string
  size: number
  width: number | null
  height: number | null
  workspaceNodeId: string | null
  kind: AttachmentKind
  durationMs: number | null
  audioCodec: string | null
  audioContainer: string | null
  waveformPeaks: number[] | null
  waveformVersion: number | null
  transcript?: VoiceTranscript | null
  playback?: VoicePlaybackSummary | null
}
```

迁移策略：

- 新增 `kind varchar(24) not null default 'file'`。
- 新增 `duration_ms integer null`、`audio_codec varchar(32) null`、`audio_container varchar(32) null`。
- 新增 `waveform_peaks jsonb null`、`waveform_version integer null`。`waveform_peaks` 存储 32-96 个 `0..100` 整数，V1 推荐 64 个。
- 回填历史图片附件：`content_type like 'image/%'` 的 `kind = 'image'`，其余保持 `file`。
- 只有 `kind = 'voice'` 的音频才按语音消息气泡渲染；普通 `audio/*` 文件仍是文件附件。

### 4.2 Voice playback table

新增 `voice_message_playbacks`，记录逐用户播放状态：

```ts
interface VoiceMessagePlayback {
  id: string
  attachmentId: string
  messageId: string
  userId: string
  firstPlayedAt: string
  lastPlayedAt: string
  completedAt: string | null
  lastPositionMs: number
  playCount: number
}
```

索引与约束：

- 唯一约束：`(attachment_id, user_id)`。
- 查询索引：`(message_id, user_id)`、`(attachment_id, completed_at)`。
- 只允许拥有该 message read access 的用户写入自己的 playback。
- 服务端返回当前 viewer 的 `playback.played`、`playback.completed`，以及作者可见的 `playback.playedCount` 聚合。

播放状态语义：

- `firstPlayedAt`：用户开始播放后写入，用于清除未听红点。
- `completedAt`：播放到 90% 或距离结尾小于 800ms 时写入。
- `lastPositionMs`：用于跨端续播；写入频率限流到每 5 秒或 pause/end。

### 4.3 Voice transcript table

新增 `voice_transcripts`，避免把转写事实塞进 `message.metadata`：

```ts
interface VoiceTranscript {
  id: string
  attachmentId: string
  messageId: string
  language: string | null
  status: 'pending' | 'processing' | 'ready' | 'failed'
  text: string | null
  source: 'client' | 'server' | 'runtime'
  provider: string | null
  confidence: number | null
  errorCode: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}
```

约束：

- 每个 `attachmentId` V1 只保留一条主转写；后续多语言可扩展为 `(attachment_id, language)` 唯一。
- `text` 最大 8000 字符；服务端写入前做长度、控制字符和 JSON 大小限制。
- 客户端上传的转写标记 `source = client`；服务端模型转写标记 `source = server`；runtime 产物标记 `source = runtime`。
- 服务端转写失败不影响语音消息本身；前端展示可重试状态。

### 4.4 Message metadata

核心语音事实存储在 attachment/playback/transcript 表里。`message.metadata` 只允许保存 UI 偏好或兼容字段，例如：

```ts
metadata.voice = {
  collapsedTranscript?: boolean
}
```

不得把完整 waveform、playback 明细或无界 transcript 写入 metadata。

## 5. 媒体格式与存储

### 5.1 格式决策

不采用“全平台强制 WebM/Opus”的旧结论。V1 采用平台原生录制 + 服务端规范化播放的策略：

- Mobile 优先录制 `m4a/aac`。
- Web 优先 `audio/mp4`，不支持时降级为 `audio/webm;codecs=opus`。
- 服务端对语音消息生成通用播放版本，目标为 `m4a/aac`。如果转码基础设施临时不可用，先存储原始格式并返回明确错误/降级状态，不能静默伪装成功。
- 存储路径按类型分组：`/shadow/voice/{uuid}.m4a`；原始临时文件可放 `/shadow/voice/original/{uuid}.{ext}`，由清理任务回收或按审计保留策略保留。

### 5.2 服务端校验

上传语音时必须校验：

- `kind = voice` 只接受 `audio/*`，并用文件头/metadata 校验，不能只信任 `Content-Type`。
- duration 必须在 `[1000, 60000]` ms。
- 转码后文件大小建议不超过 2 MB；超过则拒绝或重压缩。
- waveform 必须是有限长度的 `0..100` 整数数组；非法时服务端忽略并重新生成，不信任客户端数据。
- transcript 必须有长度、语言码、source 和写入 actor 校验；服务端模型调用必须异步执行。
- JSON/metadata 字段有长度和类型限制。
- 失败返回结构化错误码：`VOICE_TOO_SHORT`、`VOICE_TOO_LONG`、`VOICE_UNSUPPORTED_FORMAT`、`VOICE_TRANSCODE_FAILED`、`VOICE_UPLOAD_FAILED`、`VOICE_WAVEFORM_INVALID`、`VOICE_TRANSCRIPT_FAILED`。
- 服务端 STT 未配置时不得阻塞语音消息发送；手动“转换为文本”请求返回 `failed` transcript 状态并带 `VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED`。

## 6. API 与服务端流程

### 6.1 推荐发送流程：message-first

语音消息使用安全的 message-first 上传路径，复用现有“只能给自己消息补附件”的校验：

1. 客户端本地录音完成。
2. `POST /api/channels/:channelId/messages` 或 `POST /api/threads/:threadId/messages` 创建空内容消息：

```json
{
  "content": "\u200B",
  "replyToId": "...optional..."
}
```

3. 客户端上传音频：

```http
POST /api/media/upload
Content-Type: multipart/form-data

file=<audio>
messageId=<message-id>
kind=voice
durationMs=2130
waveformPeaks=[12,18,43,...]
transcriptText=可选客户端转写
transcriptLanguage=zh-CN
```

4. 服务端校验/转码/创建 attachment，保存 waveform，创建或排队 transcript，并广播 `message:updated`。
5. 客户端用 optimistic 气泡把 pending 状态替换为服务端返回结果。

原因：

- 当前无 `media_uploads` staging 表；如果继续先上传再把 URL 塞进 `attachments`，服务端难以证明 URL 属于当前用户和本次发送。
- message-first 已有作者校验、channel read 校验和 `message:updated` 广播基础。

后续可新增通用 `media_uploads` 表来安全支持 upload-first，但不阻塞 V1。

### 6.2 播放状态 API

新增播放回执接口：

```http
PUT /api/attachments/:attachmentId/voice-playback
Content-Type: application/json

{
  "positionMs": 1800,
  "completed": true
}
```

行为：

- 只允许当前用户给自己写播放状态。
- 服务端校验 attachment 是 `kind = voice`，并校验当前 actor 可读取所属 message/channel。
- 首次写入设置 `firstPlayedAt`；后续更新 `lastPlayedAt`、`lastPositionMs`、`completedAt`。
- 写入后可向当前用户其他在线设备发送 `voice:playback-updated`，也可复用 `message:updated` 的 viewer-specific 刷新。

消息列表和单条消息返回 viewer-specific 字段：

```ts
attachment.playback = {
  played: boolean
  completed: boolean
  lastPositionMs: number
  playedCount?: number
}
```

`playedCount` 只对消息作者、频道管理员或有管理权限的 actor 返回；普通接收者只看到自己的 played 状态。

### 6.3 转写 API

新增转写查询和请求接口：

```http
POST /api/attachments/:attachmentId/transcript
Content-Type: application/json

{
  "mode": "server",
  "language": "zh-CN"
}
```

```http
PUT /api/attachments/:attachmentId/transcript
Content-Type: application/json

{
  "source": "client",
  "language": "zh-CN",
  "text": "客户端识别出的文字"
}
```

行为：

- `POST` 创建服务端转写任务，状态从 `pending` 到 `processing` 到 `ready/failed`。
- `PUT` 接收客户端转写结果，必须校验发送者是消息作者或有权限补充该附件。
- 服务端转写完成后广播 `message:updated` 或 `voice:transcript-updated`。
- 搜索索引可异步消费 `voice_transcripts.status = ready` 的文本。

### 6.4 波形生成

上传时客户端可提供 `waveformPeaks`。服务端必须：

- 校验数组长度在 32-96 之间。
- 校验所有值是 `0..100` 整数。
- 缺失或非法时不信任客户端值，转为服务端异步生成。
- 对 runtime 上传、文件导入或旧音频附件，后台 job 读取私有对象生成 waveform 并更新 attachment。

### 6.5 服务端改造点

- `apps/server/src/db/schema/attachments.ts`：新增字段。
- DB migration：新增 attachment 字段、`voice_message_playbacks`、`voice_transcripts`，并回填历史附件类型。
- `apps/server/src/validators/message.schema.ts`：附件 schema 增加 `kind`、`durationMs` 等字段；服务端创建附件时不盲信客户端字段。
- `apps/server/src/services/media.service.ts`：按 `kind=voice` 走音频校验、duration 提取、转码、waveform 生成、私有对象写入。
- `apps/server/src/services/voice-transcript.service.ts`：封装客户端转写写入、服务端转写任务、预算/速率限制、失败状态。
- `apps/server/src/services/voice-playback.service.ts`：封装逐用户播放状态、聚合计数和权限检查。
- `apps/server/src/handlers/media.handler.ts`：接收 voice 表单字段，返回结构化错误，上传后广播完整附件字段。
- `apps/server/src/handlers/voice-message.handler.ts`：提供 playback/transcript API。
- `apps/server/src/dao/message.dao.ts` / `message.service.ts`：创建和查询附件字段完整透传。
- `apps/server/src/gateways/media-access.gateway.ts`：继续复用附件读权限，不为语音开放公共路径。

## 7. Web / Mobile 架构

### 7.1 Web

新增模块：

- `apps/web/src/hooks/use-voice-recorder.ts`：MediaRecorder、权限、最长/最短时长、音量采样、waveform peaks 生成。
- `apps/web/src/stores/voice-player.store.ts`：全局播放器单例状态、进度、跳转、跨消息互斥。
- `apps/web/src/stores/voice-playback.store.ts`：当前用户未听/已听状态、本地 optimistic 清除、服务端同步。
- `apps/web/src/components/chat/voice-recorder.tsx`：composer 录音态。
- `apps/web/src/components/chat/message-bubble/voice-message.tsx`：语音气泡、红点、真实波形、转写折叠展示。
- `apps/web/src/components/chat/message-bubble/voice-waveform.tsx`：统一绘制 waveform peaks 和播放进度。
- `apps/web/src/lib/voice-cache.ts`：签名 URL 下载与缓存。
- `apps/web/src/lib/voice-transcript.ts`：请求服务端转写、提交客户端转写、状态轮询或事件订阅。

集成点：

- `apps/web/src/components/chat/message-input.tsx`：加入录音入口；录音完成后走语音消息直发流程，不复用附件待发送 UI。
- `apps/web/src/components/chat/message-bubble/attachments.tsx`：`attachment.kind === 'voice'` 时走语音气泡，否则保持现有附件逻辑。
- `apps/web/src/components/chat/chat-area.tsx`：消息列表预估高度要纳入 waveform、转写展开和红点状态，避免虚拟列表跳动。
- `apps/web/src/lib/locales/*.json`：新增所有录音、播放、错误和无障碍文案。

### 7.2 Mobile

新增模块：

- `apps/mobile/src/hooks/use-voice-message-recorder.ts`：Expo AV / 生产录音实现，权限、时长、取消、waveform peaks 生成。
- `apps/mobile/src/hooks/use-voice-message-player.ts`：Expo AV Sound 全局播放、进度、跳转、后台/路由切换状态。
- `apps/mobile/src/stores/voice-playback.store.ts`：当前用户未听/已听状态、跨设备同步。
- `apps/mobile/src/components/chat/voice-recorder-bar.tsx`：composer 录音态。
- `apps/mobile/src/components/chat/voice-message-bubble.tsx`：语音气泡、红点、真实波形、转写折叠展示。
- `apps/mobile/src/components/chat/voice-waveform.tsx`：Reanimated/SVG waveform 渲染和拖动跳转。
- `apps/mobile/src/lib/voice-cache.ts`：FileSystem 缓存。
- `apps/mobile/src/lib/voice-transcript.ts`：复用现有 Typeless/STT 能力提交客户端转写，并能请求服务端转写。

集成点：

- `apps/mobile/src/components/chat/chat-composer.tsx`：区分“语音转文字按钮”和“语音消息录制”；录音态替代输入栏并直发语音消息，避免和附件预览、普通文件发送混淆。
- `apps/mobile/src/components/chat/message-bubble.tsx`：语音附件优先渲染为语音气泡。
- `apps/mobile/src/lib/socket.ts`：订阅 `voice:playback-updated` / `voice:transcript-updated` 或等价 message update。
- `apps/mobile/src/i18n/locales/*.json`：新增多语言文案。

### 7.3 交互兼容

- 桌面端如果复用 Web renderer，则自然支持 Web 语音录制；Electron 需要确认麦克风权限和 CSP/permission policy。
- 浏览器不支持 MediaRecorder 时，录音入口 disabled，并提示当前浏览器不支持录音；仍可接收和播放语音消息。
- 浏览器无法生成 waveform 时，仍允许发送，服务端异步生成；客户端 pending 气泡显示 skeleton。
- 转写不可用时，语音消息仍可发送和播放；UI 显示“转文字失败/重试”，不阻塞消息。

## 8. Runtime 支持

### 8.1 入站：用户语音消息进入 runtime

统一把语音消息当作带语义的 audio media：

```ts
{
  MediaPath: "/local/cache/voice.m4a",
  MediaType: "audio/mp4",
  VoiceMessage: true,
  VoiceDurationMs: 2130,
  VoiceAttachmentId: "...",
  VoiceWaveformPeaks: [12, 18, 43],
  VoiceTranscript: "可选转写文本",
  VoiceTranscriptStatus: "ready"
}
```

OpenClaw：

- `packages/openclaw-shadowob/src/monitor/media.ts` 在下载 `kind=voice` 或 `audio/* + durationMs` 附件时补充 voice-specific fields。
- prompt/context 中明确这是用户发送的 voice message，而不是普通文件；如果已有 transcript，把 transcript 和音频路径一起注入。
- 如果上游模型支持音频输入，使用 OpenClaw media path；如果不支持，仍提供音频文件路径和可选 transcript，不伪造内容。
- 对需要转写但消息还没有 transcript 的场景，runtime 可以调用 Shadow transcript API 请求服务端转写，不能把未验证模型猜测当作用户原话写回。

Hermes：

- `packages/connector/hermes-shadowob-plugin/adapter.py` 已有 `MessageType.AUDIO` 和 `cache_audio_from_bytes`，需要把 `kind/durationMs` 传入 `MessageEvent` metadata。
- `_resolve_inbound_media` 对 `kind=voice` 设置 dominant type 为 audio，并保留 duration、waveform、transcript。

### 8.2 出站：runtime 发送语音消息

OpenClaw：

- 新增或扩展 action：`send-voice`。
- `send` / `upload-file` 可接受 `attachmentKind: "voice"`，但公开 action 文档应推荐 `send-voice`，减少 Agent 猜参数。
- action 参数：

```json
{
  "to": "shadowob:channel:<id>",
  "media": "/path/to/audio.m4a",
  "caption": "",
  "durationMs": 2130,
  "waveformPeaks": [12, 18, 43],
  "transcript": "可选转写文本",
  "transcriptLanguage": "zh-CN",
  "replyToId": "...optional..."
}
```

- 实现上仍先创建 message，再调用 `/api/media/upload`，并传 `kind=voice`。
- 如果 action 未提供 `waveformPeaks`，服务端异步生成；如果提供 transcript，服务端按 `source = runtime` 写入 `voice_transcripts`。

Hermes：

- `send_voice()` 不再只走普通 `_send_file`，需要传 `kind=voice`、`durationMs`、`waveformPeaks`、`transcript`，缺失项由服务端提取/生成。
- `shadow_sdk.py upload_media` 增加 `kind`、`duration_ms`、`waveform_peaks`、`transcript_text`、`transcript_language` 表单字段。

SDK / CLI：

- TypeScript SDK `ShadowAttachment` 增加字段。
- Python SDK `ShadowAttachment` 增加字段。
- SDK 增加 `sendVoiceMessage` 便捷方法，内部使用 message-first flow。
- SDK 增加 `markVoicePlayed`、`requestVoiceTranscript`、`updateVoiceTranscript`。
- CLI 增加 `shadowob channels send-voice <channel-id> --file <path>`，并同步 connector skill 文档。
- CLI 增加 `shadowob voice transcript <attachment-id>` 和 `shadowob voice played <attachment-id>`，方便 runtime/自动化调试。

## 9. 安全与权限

新路由/能力的安全标注：

| 场景 | actor | resource | action | scope/capability | data class |
| --- | --- | --- | --- | --- | --- |
| 用户发送语音 | user | channel/message/attachment | write | channel membership + `messages:write` | channel-private |
| Buddy/runtime 接收语音 | agent/oauth/pat | channel/message/attachment | read | channel policy + `messages:read` + attachment read | channel-private |
| Buddy/runtime 发送语音 | agent/oauth/pat | channel/message/attachment | write | channel policy + `messages:write` + attachment write | channel-private |
| 下载语音播放 | user/agent | attachment | read | attachment owner message read access | channel-private |
| 上报播放状态 | user | attachment/playback | write | message read access + self user only | channel-private |
| 请求/写入转写 | user/agent/system | attachment/transcript | generate/write | message read/write policy + transcription capability | channel-private |

要求：

- 媒体下载继续走 `mediaAccessGateway.createAttachmentReadUrl`，不开放 MinIO public bucket。
- 上传 URL 和 runtime remote URL 下载必须保留 SSRF guard；不能跟随重定向进入本地/私有网段。
- runtime 不能拿完整用户 token；继续使用 Buddy/token 权限。
- 音频转码/metadata 提取需要超时、文件大小限制和临时文件清理。
- 语音转文字的服务端模型调用必须有 capability checks、预算、速率限制、token/音频时长估算和 audit entry。
- transcript 文本属于 channel-private 数据，不进入公开通知 payload，不暴露给无 message read access 的 actor。
- playback 明细默认只返回当前用户状态；作者侧只返回聚合计数，除非后续产品明确加入成员明细权限。
- waveform peaks 不包含语音内容，但仍随 attachment 权限返回，不单独开放公共接口。

## 10. 实施阶段

### P0：协议与 schema

- 确定 `attachments.kind/durationMs/audio*/waveform*` 字段。
- 新增 `voice_message_playbacks` 和 `voice_transcripts`。
- 同步 shared types、TS SDK、Python SDK。
- 增加 migration、attachment 查询/广播字段、viewer-specific playback 字段。

验收：现有图片/文件附件行为不变；历史附件可正常读取；消息查询能返回 voice attachment、waveform、viewer playback、transcript 状态。

### P1：服务端语音上传

- `/api/media/upload` 支持 `kind=voice`。
- 增加 duration 提取、音频格式校验、转码、waveform 校验/生成、错误码。
- message-first voice flow 集成。
- 转写服务接口和异步 job 骨架落地。

验收：server integration test 覆盖成功上传、过短、过长、伪装 content-type、非法 waveform、非作者给消息补附件、无 channel 权限下载。

### P2：播放、未听状态与波形

- Web/Mobile 渲染语音气泡、真实波形、播放进度。
- 全局播放器、跳转、缓存。
- 逐用户 playback 上报、未听红点、跨设备同步。
- i18n 文案和无障碍 label。

验收：Web/Mobile 可播放用户、Buddy、线程、DM 语音消息；未听红点播放后消失并跨设备同步；普通音频文件仍渲染为文件附件。

### P3：录制、发送与客户端转写

- Web MediaRecorder 录制后直发。
- Mobile 原生录制后直发。
- 录制时生成 waveform peaks。
- 发送前可选客户端转写，提交 `source=client` transcript。
- 取消、短录音、最长时长、上传失败重试。

验收：Web/Mobile 手动跑通频道、DM、线程发送；波形和客户端转写随消息返回；断网/权限拒绝有明确状态。

### P4：服务端转写与搜索

- 服务端转写 provider 接入，具备预算、速率限制和 audit。
- transcript 状态更新和重试。
- transcript 进入消息搜索索引和通知/摘要降级策略。

验收：请求服务端转写后状态正确流转；失败可重试；无权限用户无法读取 transcript；搜索能命中 ready transcript。

### P5：runtime

- OpenClaw inbound voice fields、`send-voice` action、smoke tests。
- Hermes inbound metadata、`send_voice` voice upload、pytest。
- Connector plan/skill 文档同步。

验收：用户给 Buddy 发语音，runtime 收到 audio path/duration/waveform/transcript；Buddy 发送 voice，Web/Mobile 按语音气泡播放并展示波形/转写。

### P6：产品打磨与发布

- 通知摘要、搜索摘要、日志与监控。
- 真实设备 QA：iOS、Android、Chrome、Safari、Desktop。
- 文档同步 website/API/SDK。

## 11. 测试计划

- Server：message-first upload、权限、duration、转码、waveform 校验/异步生成、signed URL、WebSocket `message:updated`。
- Playback：首次播放、完成播放、跨设备同步、非本人写 playback 拒绝、作者聚合计数权限。
- Transcript：客户端提交、服务端请求、状态流转、失败重试、权限隔离、长度限制、搜索索引。
- Web：recorder hook、waveform generator、player store、playback store、voice bubble、message-input 集成、i18n key coverage。
- Mobile：recorder hook、waveform generator、player hook、playback store、voice bubble、permission denied、cancel gesture。
- SDK：TS/Python attachment fields、playback/transcript types、`sendVoiceMessage`、`markVoicePlayed`、`requestVoiceTranscript`。
- Runtime：OpenClaw unit + smoke；Hermes pytest + adapter integration；覆盖 inbound transcript 和 outbound `send-voice`。
- E2E：Web 频道发送/播放/红点，Mobile 频道发送/播放/红点，DM 收发，thread 收发，Buddy 收发，转写展开和重试。
- Security：`pnpm check:security-pr`，并补充规则防止语音绕过 `mediaAccessGateway`、直接公开对象 URL、无 budget 调用转写模型、把 transcript 写入公开通知 payload。

## 12. 需要替换的旧结论

本规划覆盖旧 `voice-message-decision.md` 中以下结论：

- 不再删除或新增旧 DM 附件表；DM 已统一为 channel。
- 不强制 WebM/Opus 单一格式；采用平台原生录制 + 服务端规范化播放。
- 不把所有音频附件都当语音消息；必须有 `attachment.kind = "voice"`。
- runtime 支持不能停留在“普通附件上传”；需要入站 voice context 和出站 `send-voice`/`send_voice` 语义。
