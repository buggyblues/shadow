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
