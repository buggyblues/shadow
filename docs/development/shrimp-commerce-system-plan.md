# Shrimp Commerce System Plan

## Purpose

Shadow's commerce system exists to let value move naturally inside AI-native communities. A
creator, server owner, Buddy owner, or external app provider should be able to publish something
valuable, sell it through a Shadow shop or Buddy interaction, deliver it with clear ownership and
audit trails, and keep earning reputation from real fulfillment.

The system should prevent every new AI app from rebuilding the same SaaS stack: pricing pages,
checkout, customer records, entitlements, renewals, refunds, delivery logs, and reputation. Those
apps should focus on their core service, connect through Shadow OAuth and SDKs, open a storefront,
and let Shadow handle value discovery, purchase, entitlement ownership, settlement, and delivery
records.

## Product Vision

Shadow is not only a chat product with a wallet. It is an AI commerce community where people,
Buddies, servers, shops, files, app services, virtual items, and Cloud templates share one economy.

The core loop is:

1. A provider publishes a value object: paid file, AI service, app entitlement, server privilege,
   virtual item, Buddy artwork, physical good, or Cloud template.
2. A buyer discovers it from a personal shop, server shop, Buddy card, Business Hub, or external
   app entry.
3. The buyer understands who provides it, where it belongs, how it is delivered, how long it lasts,
   and what refund or support rules apply.
4. The buyer pays with Shrimp Coins or a supported payment rail.
5. Shadow records an order, grants an entitlement, creates fulfillment work when needed, and writes
   delivery events into a timeline.
6. The buyer can use, preview, download, redeem, chat, review, refund, or dispute from one purchase
   and delivery center.
7. The provider's real delivery history becomes public credit for the Buddy, service, shop, server,
   or app.

## Confirmed Existing Capabilities

The current codebase already has useful commerce primitives that should be extended instead of
duplicated.

- Shops can be scoped to a user or server.
- Products, categories, SKUs, product media, commerce offers, and deliverables exist.
- Wallets, ledgers, orders, order items, reviews, settlements, entitlements, and fulfillment jobs
  exist in the database model.
- Paid files already have protected grants and a controlled open/view flow.
- Entitlements can represent `resourceType`, `resourceId`, `capability`, status, expiry, order,
  product, shop, server, and metadata.
- OAuth already has first-class actors, app ownership, access tokens, scopes, and token-protected
  endpoints.
- Product context and entitlement detail APIs now expose buyer-side context for product pages and
  order details.
- Web SDK and Python SDK already have commerce product context and entitlement detail methods.

These primitives map well to the README vision. The missing part is not a new isolated marketplace;
it is a cohesive consumer experience and a small set of external-service APIs that make purchased
value usable outside Shadow.

## Primary Gaps

- Buyer context is still uneven. Every product page must consistently show provider, shop, server,
  Buddy, fulfillment promise, refund rule, credit, and asset-home links.
- Personal shops and server shops must feel like consumer storefronts, not admin explanations.
- Product cards, shop cards, Buddy cards, play cards, and server cards need shared visual
  primitives and variants so discovery feels like one product.
- External app providers need a safe entitlement query and redeem protocol.
- Buddy and service asset homepages need to become the permanent identity surface for value,
  history, revenue, reviews, and credit.
- Wallet "rights" must continue becoming "Purchases and Delivery" with useful buyer states:
  pending fulfillment, usable, delivered, awaiting review, completed, refunding.
- Seller and Buddy fulfillment needs order context, delivery actions, and audit records.
- SDK and CLI must become the automation layer for providers, not only a thin API wrapper.

## Non-Negotiable Product Principles

- Consumer language first. Pages should answer "What can I buy, who provides it, what happens next,
  and how do I get help?" before explaining platform concepts.
- One commerce model. Personal shops, server shops, Buddy cards, Business Hub, and external app
  services must reuse products, offers, orders, entitlements, fulfillment, settlement, and reviews.
- Asset identity over isolated listings. A buyer should understand an ongoing capability, not just a
  one-off item.
- Delivery creates credit. Ratings and reputation must be tied to orders, fulfillment, refunds, and
  repeat purchase signals.
- Protected assets stay protected. Paid files, workspace files, private channels, app entitlements,
  and provider callbacks must remain behind application authorization.
- OAuth apps may only read or redeem entitlements bound to their own app resource namespace.
- Wallet mutations stay behind LedgerService and verified commerce flows.
- User stories must be browser-proven end to end. If a story cannot run in the browser, finish the
  missing frontend/backend/API capability before calling the work done.
- Test/demo data should be created through local browser actions or explicit setup calls, not by
  adding seed code that hides missing product paths.

## User Stories

### 1. Protected paid digital files

As a creator, I can publish a paid file such as a document, artwork, HTML page, or asset bundle in my
personal shop. The file is protected. Only buyers with a valid entitlement can preview, open, or
download it. After purchase, the buyer receives a notification through Shadow channels such as DM,
notification, or email, and can find the purchase in the delivery center.

Acceptance criteria:

- The product has a cover, title, summary, provider, shop, price, file type, delivery rule, and
  refund rule.
- Checkout creates an order and an entitlement.
- Paid file access requires entitlement authorization.
- The buyer can open the product from wallet purchases and order details.
- The creator can see purchase history and reviews.

### 2. External app service entitlements

As an app provider, I can publish service entitlements connected to my own app. Entitlements may be
one-time, permanent, subscription-based, stock-limited, repeatable, or once-per-user. After a Shadow
user buys one, my app can query whether that user owns the entitlement and redeem it when I deliver
the value.

Acceptance criteria:

- The entitlement is bound to a resource owned by the OAuth app.
- The app uses OAuth access tokens with commerce scopes.
- Query responses are scoped to the token user and app.
- Redemption is idempotent and prevents accidental duplicate delivery.
- SDK methods exist for JavaScript/TypeScript and Python.

### 3. Provider-managed fulfillment callbacks

As an app provider with my own asset system, I can sell through Shadow, then bind or provision the
purchase in my service. The identity handoff must be based on Shadow OAuth so users cannot be mixed
up across accounts.

Acceptance criteria:

- OAuth links the Shadow user to the provider app.
- Callback or polling flows identify the OAuth app, user, product, entitlement, and order.
- Provider-side fulfillment writes back a delivery event or redemption result.
- The buyer can still see the purchase and support route in Shadow.

### 4. Server shops and protected workspace resources

As a server owner, I can open a server shop and sell assets produced in the server: files, folders,
private channel access, archived reports, or Buddy-generated newspapers. Buyers unlock read,
preview, download, or channel access according to the entitlement.

Acceptance criteria:

- Server shop pages are product-first storefronts.
- Products can point to workspace files/folders or channel access resources.
- Entitlement checks protect reads and downloads.
- Buyers can return to the server context for usage and support.
- Server owners can see orders, fulfillment state, and reviews.

### 5. Virtual items, badges, gifts, and game-style commerce

As a server or app provider, I can sell virtual items such as badges, keys, gifts, consumables, or
gacha entries. Items can be traded, gifted, consumed, or used inside a server game or external app.

Acceptance criteria:

- Products specify item type, inventory, repeatability, giftability, and usage rules.
- Entitlements or asset grants track ownership and remaining quantity.
- Consumption is recorded and cannot be replayed accidentally.
- Server and app providers can integrate through SDKs.

### 6. Buddy artwork storefronts

As a Buddy owner, I can display selected Buddy artworks on the Buddy asset homepage and sell
protected versions. Sales count, revenue, transaction history, delivery, and reviews become part of
the Buddy's public credit trail.

Acceptance criteria:

- Buddy artwork has a cover, source Buddy, owner, preview, protected file, and purchase flow.
- Buyer access is entitlement-gated.
- The Buddy asset homepage shows artwork, delivery history, reviews, and revenue summary.
- Reviews are bound to orders.

### 7. Buddy service orders

As a buyer, I can purchase a Buddy service. The Buddy receives my request, order context, deadline,
available tools, and delivery requirements. Payment settles only after completion rules are met.

Acceptance criteria:

- Buddy service product pages show scope, price, deadline, refund rule, provider, and credit.
- Checkout creates an order and fulfillment job.
- The Buddy can mark processing, send deliverables, complete, refund, or escalate.
- All actions are written to the order timeline and audit record.
- Buyer reviews affect the Buddy's credit.

### 8. Public servers as service malls

As a public server owner, I can promote a server where visitors meet Buddies, read free content, and
buy upgraded services. A Buddy can recommend products, negotiate service boundaries, and guide the
buyer to checkout while the final order remains system-recorded.

Acceptance criteria:

- Public server discovery shows real services, shops, Buddy identities, and credit.
- Buddy product cards include price, delivery promise, refund rule, and shop link.
- Negotiation creates a structured offer or quote before payment.
- Orders remain auditable even when the conversation starts the sale.

### 9. Official Shadow shop

As Shadow, I can run an official shop for memberships, invite codes, physical merchandise, badges,
community privileges, and virtual items. Eligibility rules can decide who may buy a product.

Acceptance criteria:

- Official products use the same product, order, entitlement, delivery, and review model.
- Invite codes and digital privileges can be auto-delivered.
- Eligibility checks are explicit and visible before checkout.
- Physical goods can collect shipping details without leaking financial state.

### 10. SDK and CLI automation

As a developer or operator, I can automate publishing, querying, redeeming, fulfillment, and delivery
through SDKs and CLI commands.

Acceptance criteria:

- JavaScript/TypeScript SDK and Python SDK cover external app entitlement query/redeem.
- SDKs cover product context, offer preview/purchase, paid-file open, entitlement detail/cancel,
  community assets, settlements, tips, gifts, and shop asset definitions.
- API docs describe OAuth scopes, resource ownership rules, request/response shape, and errors.
- CLI commands cover product context, offer purchase, chat commerce cards, wallet purchases,
  paid-file open, community asset operations, settlements, tips/gifts, shop offers/assets, and OAuth
  app entitlement check/redeem. Fulfillment-job automation must stay tied to orders and timelines
  when the seller/Buddy order board is expanded.

## Unified Domain Model

### Product

A purchasable definition with consumer-facing copy, cover media, type, billing mode, base price,
inventory, eligibility, and entitlement configuration.

Product templates should be understandable to buyers:

- AI service
- Paid file
- Membership or access right
- Community badge, gift, or virtual item
- Physical product
- Cloud template or play template
- External app service entitlement

### Offer

A sale surface for a product. Offers connect product, shop, seller user, seller Buddy, price
override, allowed surfaces, status, and publish controls.

### Deliverable

The actual value granted by a purchase: entitlement, paid file, workspace asset, channel access,
currency, message, external app right, or physical fulfillment instruction.

### Order

The purchase contract. It owns buyer, seller, shop, items, amount, payment status, buyer note,
seller note, cancellation, shipping, completion, refund, and review links.

### Entitlement

The durable right created by a purchase. It owns user, server, shop, product, offer, resource type,
resource id, capability, status, expiry, renewal, cancellation, revocation, and metadata.

### Fulfillment Job

The work required after purchase. It connects order, entitlement, deliverable, buyer, destination,
Buddy sender, status, attempts, next run, result, and errors.

### Asset Homepage

The persistent identity page for a Buddy, service, app, or product family. It should show identity,
owner, shop, server, buyable services, historical deliveries, reviews, revenue summary, credit
summary, and related assets.

### Credit

Credit must be generated from real commerce signals:

- completion rate
- response speed
- refund rate
- repeat purchase rate
- rating
- order-bound reviews
- cumulative sales
- delivery count

## External App Entitlement Protocol

The first external-service integration should be intentionally small and secure.

### Resource namespace

External app entitlements use:

- `resourceType = "external_app"`
- `resourceId = <oauthAppId>` for a whole-app entitlement
- `resourceId = <oauthAppId>:<featureOrSku>` for a specific feature, SKU, or consumable
- `capability = "use"` by default, or a provider-defined capability such as `redeem`, `export`,
  `premium`, or `consume`

An OAuth app may only query or redeem entitlements whose `resourceId` equals its own app id or
starts with its own app id followed by `:`.

### OAuth scopes

- `commerce:read` allows checking token-user entitlement access for the calling OAuth app.
- `commerce:write` allows redeeming an eligible entitlement for the calling OAuth app.

### Query

`GET /api/oauth/commerce/entitlements`

Parameters:

- `resourceType` optional, defaults to `external_app`
- `resourceId` optional, defaults to the caller app id
- `capability` optional, defaults to `use`

Response:

- `allowed`
- `status`
- `reasonCode`
- `resourceType`
- `resourceId`
- `capability`
- `app.id`
- `entitlement`

### Redeem

`POST /api/oauth/commerce/entitlements/redeem`

Body:

- `idempotencyKey` required
- `resourceType` optional, defaults to `external_app`
- `resourceId` optional, defaults to the caller app id
- `capability` optional, defaults to `use`
- `metadata` optional, provider delivery metadata

Behavior:

- Uses OAuth actor identity.
- Uses idempotency to make provider retries safe.
- Chooses the newest active, unredeemed entitlement for the requested app resource and capability.
- Writes a compact redemption record into entitlement metadata.
- Returns the same response for a repeated idempotency key.
- If all matching entitlements were already redeemed, returns a structured already-redeemed error.

This gives external apps a usable first integration without creating a parallel provider-ledger.
Later, high-volume consumables should move redemptions into a dedicated append-only table.

## Consumer Experience Requirements

- Discovery asks the buyer what they want to do today: find a Buddy, buy a service/content item,
  enter a shop, join a server, or deploy a Cloud/play template.
- Storefronts prioritize products and clear purchase decisions. Store descriptions support the
  shelf; they do not replace the shelf.
- Product pages must show provider, owner, shop, server, delivery promise, entitlement result,
  effective period, usage path, refund/support rules, credit, and related asset homepage.
- Wallet purchases must say what state the buyer is in and what action is available next.
- Order details must include merchant/Buddy, chat entry, deliverables, timeline, review, and
  refund/dispute entry.
- Buddy cards and product cards should be clickable as cards, not only through small buttons.
- Glass Panel primitives should be used for page sections and major panels; child cards should use
  shared domain card variants.
- Manual acceptance follows `docs/development/shrimp-commerce-manual-validation.md`; every touched
  story needs route/id evidence from the browser.

## Engineering Checklist

- Add OAuth commerce scopes.
- Add token-authenticated external app entitlement query and redeem endpoints.
- Keep OAuth resource access restricted to the caller app namespace.
- Sync API docs, TypeScript SDK, Python SDK, and tests.
- Keep product context APIs as the single buyer-facing read model for product pages.
- Continue replacing commerce surfaces with shared cards and Glass Panel section primitives.
- Replace one-off card implementations with shared domain card variants before adding new visual
  branches.
- Add server-side fulfillment timeline events and audit records for Buddy actions.
- Add asset homepage APIs that aggregate identity, offers, deliveries, reviews, and credit.
- Add CLI automation for provider workflows after the SDK API stabilizes.
- For each implemented story, record browser validation evidence before final handoff.

## Security Notes

- OAuth scopes are not enough on their own. Resource ownership must also be enforced.
- External app entitlement APIs must never let one app query or redeem another app's resources.
- Redeem calls must be idempotent.
- Paid files and protected workspace resources must stay behind application authorization.
- Wallet balance mutations must remain inside ledger-controlled purchase, refund, settlement, or
  admin-grant flows.
- Provider callbacks should use OAuth-linked identity and signed webhook delivery before automated
  settlement is trusted.
