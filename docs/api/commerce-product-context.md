# Commerce Product Context API

`GET /api/commerce/products/:productId/context`

Returns the buyer-facing product context used by shop, product, wallet, chat commerce card, and asset-home surfaces. The endpoint is read-only and does not create default offers.

## Response

```json
{
  "product": {},
  "shop": {},
  "server": {},
  "provider": {},
  "buddy": {},
  "offer": {},
  "fulfillment": {
    "status": "ready_to_purchase",
    "resourceType": "community_asset",
    "resourceId": "uuid",
    "capability": "redeem",
    "deliverables": []
  },
  "refund": {
    "policy": "order_bound",
    "status": "available_after_purchase",
    "supportPath": "/app/settings/wallet"
  },
  "credit": {
    "salesCount": 0,
    "avgRating": 0,
    "ratingCount": 0,
    "completedOrders": 0
  },
  "links": {
    "product": "/app/shop/products/:productId",
    "shop": "/app/shop/users/:userId?view=buyer",
    "server": "/app/servers/:serverSlug",
    "providerProfile": "/app/profile/:userId",
    "buddyProfile": "/app/profile/:buddyUserId",
    "assetHome": null,
    "checkoutPreview": "/api/commerce/offers/:offerId/checkout-preview"
  }
}
```

## Notes

- `product`, `shop`, and media URLs are resolved for client display.
- `server`, `provider`, `buddy`, and `offer` are nullable because products can come from personal shops, server shops, or legacy direct-product flows.
- `credit` is derived from real product sales and review counters. Do not add synthetic rank or leaderboard fields here.
- `links.assetHome` is only populated when a concrete owned asset home exists. Product definition ids are not exposed as fake grant links.
- Buyer-facing product pages, shop cards, chat cards, wallet order details, and asset-home entries
  should use this context as their shared read model. Do not create a second storefront-specific
  context shape unless a new field also belongs here.
- Consumer surfaces should link to `links.shop`, `links.server`, `links.providerProfile`,
  `links.buddyProfile`, and `links.assetHome` when present so buyers can understand who provides the
  value and where fulfillment happens.
- Card clicks should navigate to the primary product or asset detail. Buttons may provide shortcuts,
  but cards should not be inert.

## SDK and CLI

```ts
const context = await client.getCommerceProductContext('product-id')
```

```python
context = client.get_commerce_product_context("product-id")
```

```bash
shadowob commerce products context <product-id> --json
```
