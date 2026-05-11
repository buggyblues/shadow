# API 令牌

个人访问令牌（PAT）让你无需使用主密码即可通过编程方式进行认证。

## 创建令牌

```
POST /api/tokens
```

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `name` | string | 是 | 令牌名称/标签 |
| `scope` | string | 否 | 权限范围 |
| `expiresInDays` | number | 否 | 过期天数 |

明文令牌**仅在创建时返回一次**。请安全保存。

:::code-group

```ts [TypeScript]
const result = await client.createApiToken({
  name: '我的 CLI 令牌',
  scope: 'read',
  expiresInDays: 90,
})
// { id, name, token: "pat_...", scope, expiresAt, createdAt }
```

```bash [CLI]
shadowob api-tokens create --name "我的 CLI 令牌" --scope read --expires-in-days 90 --json
```

:::

---

## 列出令牌

```
GET /api/tokens
```

返回当前用户的所有令牌。明文令牌永远不会包含在内。

:::code-group

```ts [TypeScript]
const tokens = await client.listApiTokens()
```

```bash [CLI]
shadowob api-tokens list --json
```

:::

---

## 删除令牌

```
DELETE /api/tokens/:tokenId
```

撤销并删除令牌。

:::code-group

```ts [TypeScript]
await client.deleteApiToken('token-id')
```

```bash [CLI]
shadowob api-tokens delete <token-id>
```

:::
