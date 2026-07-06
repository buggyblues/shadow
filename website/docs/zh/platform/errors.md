# 错误处理

Shadow API 使用标准 HTTP 状态码并返回结构化的错误响应。

## HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| `200` | 成功 |
| `201` | 已创建 |
| `400` | 请求错误 — 参数无效 |
| `401` | 未授权 — 缺少或无效令牌 |
| `403` | 禁止 — 权限不足 |
| `404` | 未找到 — 资源不存在 |
| `409` | 冲突 — 资源已存在 |
| `429` | 请求过多 — 触发限流 |
| `500` | 空间内部错误 |

## 错误响应格式

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

## SDK 错误处理

:::code-group

```ts [TypeScript]
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'token')

try {
  const server = await client.getServer('invalid-id')
} catch (error) {
  // 错误信息包含方法、路径、状态码和响应体
  // "Shadow API GET /api/servers/invalid-id failed (404): ..."
  console.error(error.message)
}
```

```python [Python]
from shadowob_sdk import ShadowClient
import httpx

client = ShadowClient("https://shadowob.com", "token")

try:
    server = client.get_server("invalid-id")
except httpx.HTTPStatusError as e:
    print(f"状态码：{e.response.status_code}")
    print(f"响应体：{e.response.text}")
```

:::

## 限流

当超出速率限制时，API 可能返回 `429 Too Many Requests`。收到此状态码时，请实现指数退避重试策略。
