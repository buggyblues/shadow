# OAuth Commerce Entitlements

External apps can use Shadow OAuth to check and redeem purchases that were sold through Shadow
commerce. This is the smallest bridge that lets an AI app sell in Shadow, then unlock value inside
its own product without building a separate entitlement system.

## Security Model

These endpoints are token-authenticated OAuth APIs under `/api/oauth`.

Required scopes:

- `commerce:read` for entitlement access checks.
- `commerce:write` for entitlement redemption.

Resource ownership is enforced in addition to scopes. An OAuth app can only access entitlements
whose resource namespace belongs to that app:

- `resourceType` must be `external_app`.
- `resourceId` must equal the caller OAuth app id, or start with `<appId>:` for a feature/SKU
  namespace.

Examples:

- `resourceType=external_app`, `resourceId=7b0f...` for a whole-app membership.
- `resourceType=external_app`, `resourceId=7b0f...:premium` for a premium feature.
- `resourceType=external_app`, `resourceId=7b0f...:credits-100` for a consumable pack.

## Check Entitlement Access

```http
GET /api/oauth/commerce/entitlements?resourceType=external_app&resourceId=<appId>:premium&capability=use
Authorization: Bearer <oauth_access_token>
```

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `resourceType` | string | No | Defaults to `external_app`. Other values are rejected for OAuth apps. |
| `resourceId` | string | No | Defaults to the caller app id. Must be the app id or `<appId>:...`. |
| `capability` | string | No | Defaults to `use`. |

Response:

```json
{
  "allowed": true,
  "status": "active",
  "reasonCode": null,
  "resourceType": "external_app",
  "resourceId": "7b0f...:premium",
  "capability": "use",
  "app": { "id": "7b0f..." },
  "entitlement": {
    "id": "entitlement-id",
    "status": "active",
    "capability": "use",
    "resourceType": "external_app",
    "resourceId": "7b0f...:premium",
    "productId": "product-id",
    "shopId": "shop-id",
    "orderId": "order-id",
    "offerId": "offer-id",
    "expiresAt": null
  }
}
```

When access is not allowed, `allowed` is `false`, `status` explains the entitlement state, and
`reasonCode` is a stable machine-readable reason such as `ENTITLEMENT_NOT_FOUND` or
`ENTITLEMENT_EXPIRED`.

## Redeem Entitlement

```http
POST /api/oauth/commerce/entitlements/redeem
Authorization: Bearer <oauth_access_token>
Content-Type: application/json

{
  "idempotencyKey": "provider-order-20260517-001",
  "resourceType": "external_app",
  "resourceId": "<appId>:premium",
  "capability": "use",
  "metadata": {
    "providerOrderId": "provider-order-1"
  }
}
```

Body:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `idempotencyKey` | string | Yes | 8-200 chars. Reuse the same key when retrying one provider delivery. |
| `resourceType` | string | No | Defaults to `external_app`. |
| `resourceId` | string | No | Defaults to the caller app id. Must be in the caller app namespace. |
| `capability` | string | No | Defaults to `use`. |
| `metadata` | object | No | Flat provider metadata. Up to 20 keys and 2KB. Values may be string, number, boolean, or null. |

Response:

```json
{
  "redeemed": true,
  "resourceType": "external_app",
  "resourceId": "7b0f...:premium",
  "capability": "use",
  "app": { "id": "7b0f..." },
  "entitlement": {
    "id": "entitlement-id",
    "status": "active",
    "capability": "use",
    "resourceType": "external_app",
    "resourceId": "7b0f...:premium",
    "productId": "product-id",
    "shopId": "shop-id",
    "orderId": "order-id",
    "offerId": "offer-id",
    "expiresAt": null
  },
  "redemption": {
    "appId": "7b0f...",
    "resourceType": "external_app",
    "resourceId": "7b0f...:premium",
    "capability": "use",
    "idempotencyKey": "provider-order-20260517-001",
    "redeemedAt": "2026-05-17T00:00:00.000Z",
    "metadata": {
      "providerOrderId": "provider-order-1"
    }
  }
}
```

Repeated calls with the same `idempotencyKey` return the completed redemption response. A new
idempotency key redeems the newest active entitlement that has not already been redeemed for the
same app resource and capability.

Common errors:

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `OAUTH_COMMERCE_RESOURCE_TYPE_FORBIDDEN` | 403 | OAuth commerce can only access `external_app` resources. |
| `OAUTH_COMMERCE_RESOURCE_FORBIDDEN` | 403 | The `resourceId` does not belong to the caller OAuth app. |
| `EXTERNAL_ENTITLEMENT_NOT_ACTIVE` | 404 | No active entitlement exists for the token user and app resource. |
| `EXTERNAL_ENTITLEMENT_ALREADY_REDEEMED` | 409 | Matching active entitlements exist, but each one is already redeemed. |
| `ECONOMY_OPERATION_IN_PROGRESS` | 409 | Another request is processing the same idempotency key. |

## SDKs

TypeScript:

```ts
const access = await client.getOAuthCommerceEntitlementAccess({
  resourceId: `${appId}:premium`,
})

const redemption = await client.redeemOAuthCommerceEntitlement({
  idempotencyKey: 'provider-order-20260517-001',
  resourceId: `${appId}:premium`,
  metadata: { providerOrderId: 'provider-order-1' },
})
```

Python:

```python
access = client.get_oauth_commerce_entitlement_access(resource_id=f"{app_id}:premium")

redemption = client.redeem_oauth_commerce_entitlement(
    idempotency_key="provider-order-20260517-001",
    resource_id=f"{app_id}:premium",
    metadata={"providerOrderId": "provider-order-1"},
)
```

## CLI

Provider-side smoke checks can use the same OAuth access token that the app backend would send. Do
not use a normal Shadow user JWT for these OAuth endpoints.

```bash
shadowob oauth commerce check \
  --access-token <oauth-access-token> \
  --resource-id <appId>:premium \
  --json

shadowob oauth commerce redeem \
  --access-token <oauth-access-token> \
  --resource-id <appId>:premium \
  --idempotency-key provider-order-20260517-001 \
  --metadata '{"providerOrderId":"provider-order-1"}' \
  --json
```
