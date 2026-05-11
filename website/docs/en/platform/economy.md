# Community Economy

APIs for community assets, tips, gifts, and settlements powered by the Shadow economy.

## Community Assets

### List assets

```
GET /api/economy/assets
```

Returns all community assets (badges, coupons, collectibles, etc.) owned by the current user.

:::code-group

```ts [TypeScript]
const { assets } = await client.listCommunityAssets()
```

```python [Python]
result = client.list_community_assets()
assets = result["assets"]
```

:::

### Get asset

```
GET /api/economy/assets/:grantId
```

:::code-group

```ts [TypeScript]
const asset = await client.getCommunityAsset('grant-id')
```

```python [Python]
asset = client.get_community_asset("grant-id")
```

:::

### Consume asset

```
POST /api/economy/assets/:grantId/consume
```

| Field | Type | Description |
|-------|------|-------------|
| `idempotencyKey` | string | Unique key for idempotency |

:::code-group

```ts [TypeScript]
const { grant } = await client.consumeCommunityAsset('grant-id', {
  idempotencyKey: 'unique-key',
})
```

```python [Python]
result = client.consume_community_asset("grant-id", idempotencyKey="unique-key")
```

:::

### Lock / Unlock asset

```
POST /api/economy/assets/:grantId/lock
POST /api/economy/assets/:grantId/unlock
```

| Field | Type | Description |
|-------|------|-------------|
| `idempotencyKey` | string | Unique key for idempotency |

:::code-group

```ts [TypeScript]
await client.lockCommunityAsset('grant-id', { idempotencyKey: 'key' })
await client.unlockCommunityAsset('grant-id', { idempotencyKey: 'key' })
```

```python [Python]
client.lock_community_asset("grant-id", idempotencyKey="key")
client.unlock_community_asset("grant-id", idempotencyKey="key")
```

:::

### Revoke asset

```
POST /api/economy/assets/:grantId/revoke
```

| Field | Type | Description |
|-------|------|-------------|
| `idempotencyKey` | string | Unique key for idempotency |
| `reason` | string | Reason for revocation |

:::code-group

```ts [TypeScript]
await client.revokeCommunityAsset('grant-id', {
  idempotencyKey: 'key',
  reason: 'Expired',
})
```

```python [Python]
client.revoke_community_asset("grant-id", idempotencyKey="key", reason="Expired")
```

:::

---

## Tips

### Send tip

```
POST /api/economy/tips
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipientUserId` | string | Yes | Target user ID |
| `amount` | number | Yes | Tip amount |
| `message` | string | No | Optional message |
| `context.kind` | string | No | Context type |
| `context.id` | string | No | Context ID |
| `idempotencyKey` | string | Yes | Unique key |

:::code-group

```ts [TypeScript]
const { tip } = await client.sendTip({
  recipientUserId: 'user-id',
  amount: 100,
  message: 'Great job!',
  idempotencyKey: 'unique-key',
})
```

```python [Python]
result = client.send_tip(
    recipientUserId="user-id",
    amount=100,
    message="Great job!",
    idempotencyKey="unique-key",
)
```

:::

### List tips

```
GET /api/economy/tips
```

:::code-group

```ts [TypeScript]
const { tips } = await client.listTips()
```

```python [Python]
tips = client.list_tips()["tips"]
```

:::

---

## Gifts

### Send gift

```
POST /api/economy/gifts
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipientUserId` | string | Yes | Target user ID |
| `assets` | array | No | Assets to gift |
| `currencies` | array | No | Currencies to gift |
| `message` | string | No | Optional message |
| `idempotencyKey` | string | Yes | Unique key |

:::code-group

```ts [TypeScript]
const { gift } = await client.sendGift({
  recipientUserId: 'user-id',
  currencies: [{ currencyCode: 'shrimp_coin', amount: 500 }],
  message: 'Happy birthday!',
  idempotencyKey: 'unique-key',
})
```

```python [Python]
result = client.send_gift(
    recipientUserId="user-id",
    currencies=[{"currencyCode": "shrimp_coin", "amount": 500}],
    message="Happy birthday!",
    idempotencyKey="unique-key",
)
```

:::

### List gifts

```
GET /api/economy/gifts
```

:::code-group

```ts [TypeScript]
const { gifts } = await client.listGifts()
```

```python [Python]
gifts = client.list_gifts()["gifts"]
```

:::

---

## Settlements

### List settlements

```
GET /api/economy/settlements
```

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results |
| `offset` | number | Pagination offset |

:::code-group

```ts [TypeScript]
const { settlements } = await client.listSettlements({ limit: 20 })
```

```python [Python]
settlements = client.list_settlements(limit=20)["settlements"]
```

:::

### Settle available

```
POST /api/economy/settlements/settle
```

Initiates settlement of all available (pending) settlements.

:::code-group

```ts [TypeScript]
const { settlements } = await client.settleAvailableSettlements()
```

```python [Python]
result = client.settle_available_settlements()
```

:::
