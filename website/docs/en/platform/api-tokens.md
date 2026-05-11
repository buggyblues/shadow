# API Tokens

Personal Access Tokens (PATs) let you authenticate programmatically without using your main password.

## Create token

```
POST /api/tokens
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Token name/label |
| `scope` | string | No | Permission scope |
| `expiresInDays` | number | No | Days until expiration |

The plaintext token is returned **only once** on creation. Store it securely.

:::code-group

```ts [TypeScript]
const result = await client.createApiToken({
  name: 'My CLI Token',
  scope: 'read',
  expiresInDays: 90,
})
// { id, name, token: "pat_...", scope, expiresAt, createdAt }
```

```bash [CLI]
shadowob api-tokens create --name "My CLI Token" --scope read --expires-in-days 90 --json
```

:::

---

## List tokens

```
GET /api/tokens
```

Returns all tokens for the current user. The plaintext token is never included.

:::code-group

```ts [TypeScript]
const tokens = await client.listApiTokens()
```

```bash [CLI]
shadowob api-tokens list --json
```

:::

---

## Delete token

```
DELETE /api/tokens/:tokenId
```

Revoke and delete a token.

:::code-group

```ts [TypeScript]
await client.deleteApiToken('token-id')
```

```bash [CLI]
shadowob api-tokens delete <token-id>
```

:::
