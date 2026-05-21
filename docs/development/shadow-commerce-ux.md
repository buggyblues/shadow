# Shadow Commerce UX

Internal guidance for commerce work that affects buyers, sellers, Buddies, servers, external apps, or
wallet purchase/delivery flows.

## Required Context

Read these first when the task changes commerce behavior:

- `docs/development/shrimp-commerce-system-plan.md`
- `docs/development/shrimp-commerce-manual-validation.md`
- `docs/api/commerce-product-context.md` when product/shop/card context changes
- `docs/api/commerce-entitlement-detail.md` when purchase, delivery, renewal, refund, or wallet
  detail behavior changes

## Operating Rules

- Work from user stories, not feature fragments. Map the request to the affected story numbers
  before editing.
- Reuse the existing commerce model: product, offer, order, entitlement, fulfillment, settlement,
  review, asset homepage. Do not create a parallel store/order/right model.
- Frontend polish is not enough. If the browser path fails because the API, permissions, SDK
  contract, or data model is missing, complete that capability.
- Do not add seed code. Create local/test data through browser actions or explicit setup calls.
- Use consumer language. Buyers need to see what they get, who provides it, where it belongs, how
  it is delivered, validity, refund/support rules, and the next action.
- Use shared Glass Panel primitives for page sections and major panels only. Child cards should use
  shared domain card variants.
- Product, shop, Buddy, play, server, and wallet cards must be clickable as cards, with buttons as
  shortcuts.
- UI copy changes must go through i18n.
- API changes require API docs, TypeScript SDK, Python SDK, and focused tests.

## Browser Validation

Before handoff, manually validate every touched story in the browser. Minimum evidence:

```text
Story:
Role(s):
Route(s):
Record ids:
Observed result:
Remaining gap, if any:
```

If a story cannot be validated, do not mark it complete. Implement the missing path or state the
specific remaining product/backend gap.

## Story Map

- Story 1: protected paid digital files from personal shop to wallet/order detail.
- Story 2: external app entitlement check and idempotent redemption through OAuth.
- Story 3: provider-managed fulfillment still visible in Shadow order detail.
- Story 4: server shop selling protected workspace or channel resources.
- Story 5: virtual items, badges, gifts, consumables, and game-style ownership.
- Story 6: Buddy artwork storefront and asset homepage credit.
- Story 7: Buddy service order, seller/Buddy fulfillment, buyer confirm/review.
- Story 8: public server as service mall with Buddy/shop/chat entry points.
- Story 9: official shop using the same product/order/entitlement model.
- Story 10: SDK/CLI automation for the same browser-proven purchase flows.
