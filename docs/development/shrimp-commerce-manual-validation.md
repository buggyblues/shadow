# Shrimp Commerce Manual Validation

This runbook defines how commerce changes are accepted. The goal is not to add isolated feature
tiles; the goal is to prove that a buyer, seller, Buddy, server owner, or external app provider can
complete the intended value flow in the browser.

## Ground Rules

- Validate through the running web app in a browser. Do not replace this with API-only checks or E2E
  test files unless the task explicitly asks for tests.
- Create local/test records through the browser or explicit setup calls. Do not add seed code just
  to make a page look populated.
- Treat every failed browser step as a product gap. If the step is part of the story, fill the
  frontend/backend/API capability and verify again.
- Capture concrete evidence: route, role, product/order/entitlement ids, and the observed next
  buyer action.
- Use shared Glass Panel primitives only for page sections and major panels. Product, shop, Buddy,
  play, and server cards should come from shared domain card variants.
- When an API changes, sync API docs, TypeScript SDK, Python SDK, and relevant skill guidance.

## Story Validation Matrix

| Story | Browser path to prove | Must be true |
| --- | --- | --- |
| 1. Protected paid digital files | Seller publishes a paid file from a personal shop, buyer opens the product, buys it, then opens it from wallet order detail. | The file is protected before purchase and usable only through the entitlement after purchase. |
| 2. External app service entitlements | Buyer purchases an app entitlement, opens the provider app through OAuth, checks access, and redeems once. | The app can only see its own resource namespace, and repeated redemption is idempotent. |
| 3. Provider-managed fulfillment callbacks | Buyer buys an app-backed service, completes OAuth identity handoff, and sees provider delivery state return to Shadow order detail. | Shadow order/entitlement remains the source of purchase truth even when the provider provisions its own asset. |
| 4. Server shops and protected workspace resources | Server owner publishes a workspace file/folder/channel access product; buyer enters the server shop, buys, then uses it from wallet/order detail. | Server context, shop, provider, and protected resource access all remain visible and authorized. |
| 5. Virtual items, badges, gifts, and game-style commerce | Buyer purchases a virtual item, opens the asset home from wallet, consumes or gifts it, then returns to the updated asset state. | Quantity/status changes are recorded and cannot be replayed accidentally. |
| 6. Buddy artwork storefronts | Buyer opens a Buddy/asset homepage, buys a protected artwork/file, then sees purchase history and review state tied back to the Buddy. | Artwork sales, reviews, and delivery history contribute to the Buddy credit surface. |
| 7. Buddy service orders | Buyer buys a Buddy service from product page or chat card; seller/Buddy processes, ships, completes, and buyer reviews. | Order context, delivery deadline, timeline, audit trail, and review are all visible. |
| 8. Public servers as service malls | Buyer discovers a public server, enters it, finds Buddy/shop/service cards, purchases, and returns to the server/chat context for fulfillment. | Discovery, server, shop, chat, and order flows are one connected loop. |
| 9. Official Shadow shop | Buyer opens an official shop product such as membership, invite, badge, physical item, or privilege and reaches checkout with eligibility shown. | Official products use the same order/entitlement/delivery model, with visible eligibility and fulfillment requirements. |
| 10. SDK and CLI automation | Developer follows docs or sample app to query/redeem/publish against the same purchase created in the browser. | Automation supports the browser-proven flow; it does not introduce a parallel commerce model. |

## Evidence Template

Use this shape in implementation notes or PR summaries:

```text
Story:
Role(s):
Route(s):
Record ids:
Observed result:
Remaining gap, if any:
```

## Capability Completion Rule

Do not mark a story complete because one side of the system works. A story is complete only when the
browser proves the whole loop:

1. discovery or entry point
2. product/shop/service understanding
3. purchase or entitlement action
4. delivery/usage/refund/review next step
5. visible link back to the provider, shop, server, Buddy, or asset homepage
