# 社区经济

社区资产、打赏、礼物和结算的 API，由 Shadow 经济系统驱动。

## 社区资产

### 列出资产

```
GET /api/economy/assets
```

返回当前用户拥有的所有社区资产（徽章、优惠券、收藏品等）。

:::code-group

```ts [TypeScript]
const { assets } = await client.listCommunityAssets()
```

```python [Python]
result = client.list_community_assets()
assets = result["assets"]
```

:::

### 获取资产

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

### 消费资产

```
POST /api/economy/assets/:grantId/consume
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `idempotencyKey` | string | 幂等键 |

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

### 锁定 / 解锁资产

```
POST /api/economy/assets/:grantId/lock
POST /api/economy/assets/:grantId/unlock
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `idempotencyKey` | string | 幂等键 |

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

### 撤销资产

```
POST /api/economy/assets/:grantId/revoke
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `idempotencyKey` | string | 幂等键 |
| `reason` | string | 撤销原因 |

:::code-group

```ts [TypeScript]
await client.revokeCommunityAsset('grant-id', {
  idempotencyKey: 'key',
  reason: '已过期',
})
```

```python [Python]
client.revoke_community_asset("grant-id", idempotencyKey="key", reason="已过期")
```

:::

---

## 打赏

### 发送打赏

```
POST /api/economy/tips
```

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `recipientUserId` | string | 是 | 目标用户 ID |
| `amount` | number | 是 | 打赏金额 |
| `message` | string | 否 | 可选留言 |
| `context.kind` | string | 否 | 上下文类型 |
| `context.id` | string | 否 | 上下文 ID |
| `idempotencyKey` | string | 是 | 幂等键 |

:::code-group

```ts [TypeScript]
const { tip } = await client.sendTip({
  recipientUserId: 'user-id',
  amount: 100,
  message: '做得好！',
  idempotencyKey: 'unique-key',
})
```

```python [Python]
result = client.send_tip(
    recipientUserId="user-id",
    amount=100,
    message="做得好！",
    idempotencyKey="unique-key",
)
```

:::

### 列出打赏

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

## 礼物

### 发送礼物

```
POST /api/economy/gifts
```

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `recipientUserId` | string | 是 | 目标用户 ID |
| `assets` | array | 否 | 要赠送的资产 |
| `currencies` | array | 否 | 要赠送的货币 |
| `message` | string | 否 | 可选留言 |
| `idempotencyKey` | string | 是 | 幂等键 |

:::code-group

```ts [TypeScript]
const { gift } = await client.sendGift({
  recipientUserId: 'user-id',
  currencies: [{ currencyCode: 'shrimp_coin', amount: 500 }],
  message: '生日快乐！',
  idempotencyKey: 'unique-key',
})
```

```python [Python]
result = client.send_gift(
    recipientUserId="user-id",
    currencies=[{"currencyCode": "shrimp_coin", "amount": 500}],
    message="生日快乐！",
    idempotencyKey="unique-key",
)
```

:::

### 列出礼物

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

## 结算

### 列出结算

```
GET /api/economy/settlements
```

| 参数 | 类型 | 描述 |
|-------|------|-------------|
| `limit` | number | 最大结果数 |
| `offset` | number | 分页偏移 |

:::code-group

```ts [TypeScript]
const { settlements } = await client.listSettlements({ limit: 20 })
```

```python [Python]
settlements = client.list_settlements(limit=20)["settlements"]
```

:::

### 结算可用

```
POST /api/economy/settlements/settle
```

发起所有可用（待处理）结算的结算。

:::code-group

```ts [TypeScript]
const { settlements } = await client.settleAvailableSettlements()
```

```python [Python]
result = client.settle_available_settlements()
```

:::
