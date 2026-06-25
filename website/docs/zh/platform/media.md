# 媒体

## 上传文件

```
POST /api/media/upload
```

上传文件附件。使用 multipart 表单数据。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 要上传的文件 |
| `messageId` | string | 否 | 将附件关联到频道消息 |
| `kind` | `file` / `image` / `voice` / `avatar` | 否 | 头像上传传 `avatar`，语音消息传 `voice` |
| `durationMs` | number | 语音必填 | 语音时长，1-60 秒 |
| `waveformPeaks` | JSON number array | 否 | 32-96 个波形峰值，`0..100` |
| `transcriptText` | string | 否 | 可选的用户可见语音转文字 |

**响应：**

```json
{
  "id": "attachment-uuid",
  "url": "https://cdn.shadow.app/...",
  "filename": "photo.png",
  "contentType": "image/png",
  "size": 102400
}
```

语音上传会保存为私有 `/shadow/voice/...` contentRef，播放时仍必须通过签名媒体 URL 交付。

头像不是签名媒体。用户头像、服务器图标、Buddy 头像等身份图片会在 API 响应中直接返回稳定公开 URL，例如 `/api/media/avatar/...` 或原始 HTTPS 图片地址。Server App 和 integration 直接把这个 URL 用作 `<img src>`；不要为了头像再请求附件媒体 URL，也不要持久化短期媒体 URL。

:::code-group

```ts [TypeScript]
const attachment = await client.uploadMedia(blob, 'photo.png', 'image/png', 'message-id')
```

```python [Python]
attachment = client.upload_media(
    file_bytes,
    "photo.png",
    "image/png",
    message_id="message-id",
)
```

:::

---

## 解析附件媒体 URL

```
GET /api/attachments/:id/media-url?disposition=inline
```

认证调用方并校验其对父频道的访问权限后，返回短期可被浏览器渲染的 URL。数据库中只保存上传接口返回的附件 `url` / contentRef，不要持久化这个签名 URL。

**响应：**

```json
{
  "url": "/api/media/signed/<token>",
  "expiresAt": "2026-05-07T10:00:00.000Z"
}
```

:::code-group

```ts [TypeScript]
const media = await client.resolveAttachmentMediaUrl(attachmentId, {
  disposition: 'inline',
})
```

```python [Python]
media = client.resolve_attachment_media_url(
    attachment_id,
    disposition="inline",
)
```

:::

## 交付签名媒体

```
GET /api/media/signed/:token
```

不要求 Bearer token。token 绑定 bucket/key、content type、disposition 和过期时间。HTML、SVG、JavaScript、XML 等 active content 即使请求 `inline` 也会强制按附件下载。响应包含 `Cache-Control: private`、`X-Content-Type-Options: nosniff`，并支持 `Range` 请求。
