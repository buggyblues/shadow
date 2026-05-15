# Mobile E2E Design

## Goals

- Cover the routed mobile experience in `apps/mobile/app/(main)/servers/*`
- Prevent regressions in chat realtime, shop data mapping, and workspace file operations
- Align mobile validation with the already-verified web/server contracts

## Scope

### P0 user journeys

1. Server navigation
   - Open a server
   - View grouped channels and utility entries
   - Create a text channel
   - Enter the created channel

2. Channel realtime
   - Load initial message list from `/api/channels/:channelId/messages`
   - Send a message through websocket
   - Receive `message:new` and render exactly once
   - Receive `message:updated` and update edited state
   - Receive `message:deleted` and remove the message
   - Show typing indicator when another client emits `message:typing`

3. Shop flow
   - Load `/shop/products` when response shape is `{ products, total }`
   - Search and category filter products
   - Add product to local cart
   - Submit checkout request successfully
   - Verify cart reset after checkout

4. Workspace flow
   - Load `/workspace/children`
   - Create folder through `/workspace/folders`
   - Upload file through `/workspace/upload`
   - Delete file through `/workspace/files/:id`
   - Delete folder through `/workspace/folders/:id`

5. Server settings
   - Load editable fields for owner
   - Save name/description
   - Verify translated labels render
   - Leave or delete server depending on role

## Test strategy

### Layer 1: contract-backed integration tests

Prefer API-mocked mobile integration tests around routed screens:

- Mock `fetchApi`
- Mock socket singleton methods:
  - `joinChannel`
  - `leaveChannel`
  - `sendWsMessage`
  - `sendTyping`
- Trigger socket event callbacks for:
  - `message:new`
  - `message:updated`
  - `message:deleted`
  - `message:typing`

Recommended screen-level targets:

- `app/(main)/servers/[serverSlug]/channels/[channelId].tsx`
- `app/(main)/servers/[serverSlug]/shop.tsx`
- `app/(main)/servers/[serverSlug]/workspace.tsx`
- `app/(main)/servers/[serverSlug]/server-settings.tsx`

### Layer 2: device-level smoke tests

When adding a mobile E2E runner (Detox or Maestro), start with a smoke suite:

1. Login
2. Enter a server
3. Open a channel and send a message
4. Open shop and add an item to cart
5. Open workspace and create a folder

## Fixtures

### Chat fixtures

- Server with one text channel
- 20 seeded messages
- One current user and one remote user
- Socket event fixture payloads matching server handlers exactly

### Shop fixtures

- Product response fixture:

```json
{
  "products": [
    {
      "id": "prod_1",
      "name": "Starter Pack",
      "basePrice": 99,
      "imageUrl": null,
      "categoryId": "cat_1",
      "stock": 5,
      "status": "active"
    }
  ],
  "total": 1
}
```

### Workspace fixtures

- Root folder
- Nested folder
- One text file and one image file
- Child node responses using `kind` and `sizeBytes`

## Assertions that matter

- No duplicate chat messages after local send + server echo
- Typing indicator disappears automatically
- Shop product list accepts object response shape
- Workspace uses the correct route family and never calls `/workspace/nodes`
- Translations do not fall back to raw key names in server/channel/settings pages

## Rollout order

1. Add contract-backed screen tests for channel/shop/workspace
2. Add server-settings regression test
3. Add device-level smoke flow
4. Expand to notification and background reconnect behavior
