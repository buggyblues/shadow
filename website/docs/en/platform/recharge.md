# Recharge

Top up your wallet balance via Stripe payment integration.

## Get recharge config

```
GET /api/v1/recharge/config
```

Returns available recharge tiers, exchange rate, and Stripe publishable key.

:::code-group

```ts [TypeScript]
const config = await client.getRechargeConfig()
// { tiers: [...], customAmountMin, customAmountMax, exchangeRate, stripePublishableKey }
```

```python [Python]
config = client.get_recharge_config()
```

:::

---

## Create recharge intent

```
POST /api/v1/recharge/create-intent
```

Creates a Stripe PaymentIntent for wallet top-up.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tier` | string | Yes | `1000`, `3000`, `5000`, or `custom` |
| `idempotencyKey` | string | Yes | Unique key to prevent duplicates |
| `customAmount` | number | No | Custom amount (for `custom` tier) |
| `currency` | string | No | Currency code |

:::code-group

```ts [TypeScript]
const intent = await client.createRechargeIntent({
  tier: '1000',
  idempotencyKey: 'unique-key',
})
// { clientSecret, paymentIntentId, orderNo, amount }
```

```python [Python]
intent = client.create_recharge_intent(
    tier="1000",
    idempotencyKey="unique-key",
)
```

:::

---

## Confirm payment

```
POST /api/v1/recharge/confirm
```

Confirm a completed Stripe payment and credit the wallet.

| Field | Type | Description |
|-------|------|-------------|
| `paymentIntentId` | string | Stripe PaymentIntent ID |

:::code-group

```ts [TypeScript]
const order = await client.confirmRechargePayment('pi_xxx')
```

```python [Python]
order = client.confirm_recharge_payment("pi_xxx")
```

:::

---

## Recharge history

```
GET /api/v1/recharge/history
```

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results |
| `offset` | number | Pagination offset |

:::code-group

```ts [TypeScript]
const history = await client.getRechargeHistory({ limit: 20 })
// { items: [...], total, limit, offset }
```

```python [Python]
history = client.get_recharge_history(limit=20)
```

:::
