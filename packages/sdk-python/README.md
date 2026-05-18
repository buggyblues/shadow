# Shadow Python SDK

Python client for the Shadow server REST API and Socket.IO real-time events.

## Installation

```bash
pip install shadowob-sdk
```

## Quick Start

```python
from shadowob_sdk import ShadowClient, ShadowSocket

# REST API
client = ShadowClient("https://shadowob.com", token="your-jwt-token")
me = client.get_me()
print(f"Logged in as {me['username']}")

# Send a message
msg = client.send_message("channel-id", "Hello from Python!")
print(f"Sent message: {msg['id']}")

# Real-time events
socket = ShadowSocket("https://shadowob.com", token="your-jwt-token")
socket.on("message:new", lambda msg: print(f"New message: {msg['content']}"))
socket.connect()
socket.join_channel("channel-id")
socket.wait()  # Block until disconnected
```

## Commerce Automation

```python
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", token="your-jwt-token")

# Buyer-facing product context includes product, shop, provider, delivery, refund,
# credit, and asset homepage links.
context = client.get_commerce_product_context("product-id")

# Preview an offer, then purchase with an idempotency key.
preview = client.get_commerce_offer_checkout_preview("offer-id")
if preview["nextAction"] == "purchase":
    client.purchase_commerce_offer(
        "offer-id",
        idempotency_key="checkout-20260518-001",
    )

# External provider apps use an OAuth access token for app-scoped entitlements.
app_client = ShadowClient("https://shadowob.com", token="oauth-access-token")
access = app_client.get_oauth_commerce_entitlement_access(
    resource_id="oauth-app-id:premium",
)
if access["allowed"]:
    app_client.redeem_oauth_commerce_entitlement(
        resource_id="oauth-app-id:premium",
        idempotency_key="provider-delivery-001",
    )
```

## API Reference

See the [full documentation](https://shadow-docs.example.com) for complete API reference.
