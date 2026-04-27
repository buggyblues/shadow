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
| `dmMessageId` | string | 否 | 将附件关联到私信消息 |

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
const attachment = await client.uploadMedia(blob, 'photo.png', 'image/png', {
  dmMessageId: 'dm-message-id',
})
```

```python [Python]
attachment = client.upload_media(
    file_bytes,
    "photo.png",
    "image/png",
    dm_message_id="dm-message-id",
)
```

:::

---

## 获取文件

```
GET /api/media/:id
```

重定向到文件的预签名下载 URL。

:::code-group

```ts [TypeScript]
const url = `${client.baseUrl}/api/media/${attachmentId}`
// 重定向 — 可直接用在 <img> 或 <a> 标签中
```

```python [Python]
url = f"{client.base_url}/api/media/{attachment_id}"
# 重定向 — 跟随重定向以下载
```

:::
