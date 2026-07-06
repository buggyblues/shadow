# Error Handling

The Shadow API uses standard HTTP status codes and returns structured error responses.

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request — invalid parameters |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Not Found — resource does not exist |
| `409` | Conflict — resource already exists |
| `429` | Too Many Requests — rate limited |
| `500` | Internal Space Error |

## Error Response Format

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

## SDK Error Handling

:::code-group

```ts [TypeScript]
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'token')

try {
  const server = await client.getServer('invalid-id')
} catch (error) {
  // Error message includes method, path, status, and body
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
    print(f"Status: {e.response.status_code}")
    print(f"Body: {e.response.text}")
```

:::

## Rate Limiting

The API may return `429 Too Many Requests` when rate limits are exceeded. Implement exponential backoff when you receive this status code.
