# Apps

Server apps are custom mini-applications that run inside a server. They can be HTML pages, zip bundles, or external URL proxies.

## List apps

```
GET /api/servers/:serverId/apps
```

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `limit` | number | Max results |
| `offset` | number | Offset |

:::code-group

```ts [TypeScript]
const apps = await client.listApps('server-id')
```

```python [Python]
apps = client.list_apps("server-id")
```

:::

---

## Get homepage app

```
GET /api/servers/:serverId/apps/homepage
```

Returns the app designated as the server homepage.

:::code-group

```ts [TypeScript]
const homepage = await client.getHomepageApp('server-id')
```

```python [Python]
homepage = client.get_homepage_app("server-id")
```

:::

---

## Get app

```
GET /api/servers/:serverId/apps/:appId
```

Supports lookup by UUID or slug.

:::code-group

```ts [TypeScript]
const app = await client.getApp('server-id', 'app-id')
```

```python [Python]
app = client.get_app("server-id", "app-id")
```

:::

---

## Create app

```
POST /api/servers/:serverId/apps
```

Requires server admin permission.

:::code-group

```ts [TypeScript]
const app = await client.createApp('server-id', {
  name: 'Dashboard',
  slug: 'dashboard',
  type: 'html',
  htmlContent: '<h1>Hello</h1>',
})
```

```python [Python]
app = client.create_app("server-id",
    name="Dashboard",
    slug="dashboard",
    type="html",
    htmlContent="<h1>Hello</h1>",
)
```

:::

---

## Update app

```
PATCH /api/servers/:serverId/apps/:appId
```

:::code-group

```ts [TypeScript]
await client.updateApp('server-id', 'app-id', { name: 'New Name' })
```

```python [Python]
client.update_app("server-id", "app-id", name="New Name")
```

:::

---

## Delete app

```
DELETE /api/servers/:serverId/apps/:appId
```

:::code-group

```ts [TypeScript]
await client.deleteApp('server-id', 'app-id')
```

```python [Python]
client.delete_app("server-id", "app-id")
```

:::

---

## Publish from workspace

```
POST /api/servers/:serverId/apps/publish
```

Publishes workspace files as an app. Requires admin permission.

:::code-group

```ts [TypeScript]
const app = await client.publishApp('server-id', {
  name: 'My App',
  slug: 'my-app',
  folderId: 'workspace-folder-id',
})
```

```python [Python]
app = client.publish_app("server-id",
    name="My App",
    slug="my-app",
    folderId="workspace-folder-id",
)
```

:::

---

## Serve app content

```
GET /api/servers/:serverId/apps/:appId/serve/*
```

Serves the app's static content. For URL-type apps, use the proxy endpoint:

```
ALL /api/app-proxy/:appId/*
```

These endpoints are public and do not require authentication.

When a URL-type app's backing Cloud deployment is paused, the app proxy will automatically trigger a resume. If the deployment takes longer than 25 seconds to start, a `503` status is returned with `Retry-After: 5`.
