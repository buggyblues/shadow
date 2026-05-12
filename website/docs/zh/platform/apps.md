# 应用

服务器应用是运行在服务器内部的自定义迷你应用程序。它们可以是 HTML 页面、zip 包或外部 URL 代理。

## 列出应用

```
GET /api/servers/:serverId/apps
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | 按状态筛选 |
| `limit` | number | 最大结果数 |
| `offset` | number | 偏移量 |

:::code-group

```ts [TypeScript]
const apps = await client.listApps('server-id')
```

```python [Python]
apps = client.list_apps("server-id")
```

:::

---

## 获取首页应用

```
GET /api/servers/:serverId/apps/homepage
```

返回被设为服务器首页的应用。

:::code-group

```ts [TypeScript]
const homepage = await client.getHomepageApp('server-id')
```

```python [Python]
homepage = client.get_homepage_app("server-id")
```

:::

---

## 获取应用

```
GET /api/servers/:serverId/apps/:appId
```

支持 UUID 或 slug 查找。

:::code-group

```ts [TypeScript]
const app = await client.getApp('server-id', 'app-id')
```

```python [Python]
app = client.get_app("server-id", "app-id")
```

:::

---

## 创建应用

```
POST /api/servers/:serverId/apps
```

需要服务器管理员权限。

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

## 更新应用

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

## 删除应用

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

## 从工作区发布

```
POST /api/servers/:serverId/apps/publish
```

将工作区文件发布为应用。需要管理员权限。

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

## 提供应用内容

```
GET /api/servers/:serverId/apps/:appId/serve/*
```

提供应用的静态内容。对于 URL 类型的应用，使用代理端点：

```
ALL /api/app-proxy/:appId/*
```

这些端点是公开的，不需要认证。

当 URL 类型 App 所依赖的 Cloud 部署处于暂停状态时，App 代理会自动触发恢复。如果部署启动超过 25 秒，将返回 `503` 状态码及 `Retry-After: 5`。
