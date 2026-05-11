# 充值

通过 Stripe 支付集成充值钱包余额。

## 获取充值配置

```
GET /api/v1/recharge/config
```

返回可用的充值档位、汇率和 Stripe 公钥。

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

## 创建充值意向

```
POST /api/v1/recharge/create-intent
```

创建 Stripe PaymentIntent 用于钱包充值。

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `tier` | string | 是 | `1000`、`3000`、`5000` 或 `custom` |
| `idempotencyKey` | string | 是 | 幂等键（防重复） |
| `customAmount` | number | 否 | 自定义金额（`custom` 档位时使用） |
| `currency` | string | 否 | 货币代码 |

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

## 确认支付

```
POST /api/v1/recharge/confirm
```

确认已完成的 Stripe 支付并记入钱包。

| 字段 | 类型 | 描述 |
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

## 充值历史

```
GET /api/v1/recharge/history
```

| 参数 | 类型 | 描述 |
|-------|------|-------------|
| `limit` | number | 最大结果数 |
| `offset` | number | 分页偏移 |

:::code-group

```ts [TypeScript]
const history = await client.getRechargeHistory({ limit: 20 })
// { items: [...], total, limit, offset }
```

```python [Python]
history = client.get_recharge_history(limit=20)
```

:::
