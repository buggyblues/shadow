# Commerce Entitlement Detail

## GET `/api/entitlements/:entitlementId`

Returns a single purchase entitlement with the linked shop, product, offer, paid file, buyer,
order, and fulfillment jobs. The buyer can read their own entitlement. A shop manager can read
entitlements belonging to their shop. Product summaries include `tags`; desktop pet pack purchases
also carry `metadata.desktopPetPack` so desktop clients can discover entitlement-backed pack
downloads without public object URLs.

### Response

```json
{
  "id": "entitlement-id",
  "userId": "buyer-user-id",
  "shopId": "shop-id",
  "orderId": "order-id",
  "productId": "product-id",
  "status": "active",
  "isActive": true,
  "expiresAt": "2026-06-15T12:00:00.000Z",
  "nextRenewalAt": "2026-06-15T12:00:00.000Z",
  "resourceType": "workspace_file",
  "resourceId": "file-id",
  "capability": "view",
  "shop": { "id": "shop-id", "name": "Store", "ownerUserId": "owner-user-id" },
  "product": { "id": "product-id", "name": "Product", "basePrice": 8, "tags": ["desktop-pet-pack"] },
  "metadata": {
    "desktopPetPack": {
      "kind": "desktop_pet_pack",
      "format": "codex-pet"
    }
  },
  "offer": { "id": "offer-id", "status": "active" },
  "paidFile": { "id": "file-id", "name": "lazy-codex-pet.zip" },
  "buyer": { "id": "buyer-user-id", "username": "buyer" },
  "order": { "id": "order-id", "orderNo": "SH...", "status": "completed" },
  "fulfillmentJobs": []
}
```

## POST `/api/entitlements/:entitlementId/cancel`

Cancels the current entitlement and returns the prorated refund amount when the entitlement has a
finite validity window. Only the buyer who owns the entitlement can cancel it.

```json
{ "reason": "buyer_requested_refund" }
```

## POST `/api/entitlements/:entitlementId/cancel-renewal`

Stops auto-renewal for an active subscription entitlement while keeping the current access active
until `expiresAt`. The response keeps `refundAmount` at `0` because this is not a current-period
refund.

```json
{ "reason": "buyer_cancelled_auto_renewal" }
```

### Buyer UX Contract

Wallet purchase and order-detail surfaces should translate entitlement/order state into buyer
actions instead of exposing raw lifecycle labels:

| Condition | Buyer state | Primary action |
| --- | --- | --- |
| Manual service order is paid and not shipped | Waiting for fulfillment | Contact seller/Buddy or view timeline |
| Manual service order is delivered | Delivered | Confirm completion or request support |
| Manual service order is completed | Completed | View delivery summary and review |
| Paid file entitlement is active | Usable | Open or download protected content |
| Subscription entitlement has `nextRenewalAt` | Active subscription | Stop renewal, not refund current period |
| Refund/cancel is available | Support needed | Request refund or dispute from the order detail |

Every order-detail view should also keep links back to the product, shop, provider profile, server
context when relevant, and asset homepage when one exists.

## SDK and CLI

```ts
const entitlement = await client.getEntitlement('entitlement-id')
const opened = await client.openPaidFile('file-id')
console.log(opened.viewerUrl, opened.grantToken)
await client.cancelEntitlementRenewal('entitlement-id', {
  reason: 'buyer_cancelled_auto_renewal',
})
```

```python
entitlement = client.get_entitlement("entitlement-id")
opened = client.open_paid_file("file-id")
print(opened["viewerUrl"], opened.get("grantToken"))
client.cancel_entitlement_renewal(
    "entitlement-id",
    reason="buyer_cancelled_auto_renewal",
)
```

```bash
shadowob commerce entitlements get <entitlement-id> --json
shadowob commerce paid-files open <file-id> --json
shadowob commerce entitlements cancel-renewal <entitlement-id> --reason buyer_cancelled_auto_renewal --json
```
