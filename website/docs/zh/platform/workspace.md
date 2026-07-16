# 工作区

每个 Space 都有一个工作区 — 用来存储文件和文件夹的虚拟文件系统。应用可以从工作区内容中发布。

## 获取工作区

```
GET /api/servers/:serverId/workspace
```

:::code-group

```ts [TypeScript]
const workspace = await client.getWorkspace('server-id')
```

```python [Python]
workspace = client.get_workspace("server-id")
```

:::

---

## 更新工作区

```
PATCH /api/servers/:serverId/workspace
```

:::code-group

```ts [TypeScript]
await client.updateWorkspace('server-id', { name: 'Updated' })
```

```python [Python]
client.update_workspace("server-id", name="Updated")
```

:::

---

## 获取文件树

```
GET /api/servers/:serverId/workspace/tree
```

返回完整的工作区树结构。

:::code-group

```ts [TypeScript]
const tree = await client.getWorkspaceTree('server-id')
```

```python [Python]
tree = client.get_workspace_tree("server-id")
```

:::

---

## 获取工作区统计

```
GET /api/servers/:serverId/workspace/stats
```

:::code-group

```ts [TypeScript]
const stats = await client.getWorkspaceStats('server-id')
```

```python [Python]
stats = client.get_workspace_stats("server-id")
```

:::

---

## 列出子节点

```
GET /api/servers/:serverId/workspace/children?parentId=folder-id
```

:::code-group

```ts [TypeScript]
const children = await client.getWorkspaceChildren('server-id', 'parent-folder-id')
```

```python [Python]
children = client.get_workspace_children("server-id", parent_id="parent-folder-id")
```

:::

---

## 批量列出子节点

```
POST /api/servers/:serverId/workspace/children/batch
```

:::code-group

```ts [TypeScript]
const result = await client.batchWorkspaceChildren('server-id', ['folder-1', 'folder-2'])
```

```python [Python]
result = client.batch_workspace_children("server-id", parent_ids=["folder-1", "folder-2"])
```

:::

---

## 下载工作区

```
GET /api/servers/:serverId/workspace/download
```

将整个工作区下载为 ZIP 文件。

:::code-group

```ts [TypeScript]
const blob = await client.downloadWorkspace('server-id')
```

```python [Python]
data = client.download_workspace("server-id")
```

:::

---

## 文件夹

### 创建文件夹

```
POST /api/servers/:serverId/workspace/folders
```

:::code-group

```ts [TypeScript]
const folder = await client.createWorkspaceFolder('server-id', {
  name: 'docs',
  parentId: null,
})
```

```python [Python]
folder = client.create_workspace_folder("server-id", name="docs")
```

:::

### 更新文件夹

```
PATCH /api/servers/:serverId/workspace/folders/:folderId
```

:::code-group

```ts [TypeScript]
await client.updateWorkspaceFolder('server-id', 'folder-id', { name: 'renamed' })
```

```python [Python]
client.update_workspace_folder("server-id", "folder-id", name="renamed")
```

:::

### 删除文件夹

```
DELETE /api/servers/:serverId/workspace/folders/:folderId
```

:::code-group

```ts [TypeScript]
await client.deleteWorkspaceFolder('server-id', 'folder-id')
```

```python [Python]
client.delete_workspace_folder("server-id", "folder-id")
```

:::

### 搜索文件夹

```
GET /api/servers/:serverId/workspace/folders/search
```

:::code-group

```ts [TypeScript]
const folders = await client.searchWorkspaceFolders('server-id', { query: 'docs' })
```

```python [Python]
folders = client.search_workspace_folders("server-id", query="docs")
```

:::

### 下载文件夹

```
GET /api/servers/:serverId/workspace/folders/:folderId/download
```

将特定文件夹下载为 ZIP 文件。

:::code-group

```ts [TypeScript]
const blob = await client.downloadWorkspaceFolder('server-id', 'folder-id')
```

```python [Python]
data = client.download_workspace_folder("server-id", "folder-id")
```

:::

---

## 文件

### 创建文件

```
POST /api/servers/:serverId/workspace/files
```

:::code-group

```ts [TypeScript]
const file = await client.createWorkspaceFile('server-id', {
  name: 'index.html',
  content: '<h1>Hello</h1>',
  parentId: 'folder-id',
})
```

```python [Python]
file = client.create_workspace_file("server-id",
    name="index.html",
    content="<h1>Hello</h1>",
    parentId="folder-id",
)
```

:::

### 获取文件

```
GET /api/servers/:serverId/workspace/files/:fileId
```

:::code-group

```ts [TypeScript]
const file = await client.getWorkspaceFile('server-id', 'file-id')
```

```python [Python]
file = client.get_workspace_file("server-id", "file-id")
```

:::

### 更新文件

```
PATCH /api/servers/:serverId/workspace/files/:fileId
```

:::code-group

```ts [TypeScript]
await client.updateWorkspaceFile('server-id', 'file-id', {
  content: '<h1>Updated</h1>',
})
```

```python [Python]
client.update_workspace_file("server-id", "file-id", content="<h1>Updated</h1>")
```

:::

### 删除文件

```
DELETE /api/servers/:serverId/workspace/files/:fileId
```

:::code-group

```ts [TypeScript]
await client.deleteWorkspaceFile('server-id', 'file-id')
```

```python [Python]
client.delete_workspace_file("server-id", "file-id")
```

:::

### 搜索文件

```
GET /api/servers/:serverId/workspace/files/search
```

:::code-group

```ts [TypeScript]
const files = await client.searchWorkspaceFiles('server-id', { query: 'index' })
```

```python [Python]
files = client.search_workspace_files("server-id", query="index")
```

:::

### 克隆文件

```
POST /api/servers/:serverId/workspace/files/:fileId/clone
```

:::code-group

```ts [TypeScript]
const clone = await client.cloneWorkspaceFile('server-id', 'file-id')
```

```python [Python]
clone = client.clone_workspace_file("server-id", "file-id")
```

:::

---

## 批量操作

### 粘贴节点

```
POST /api/servers/:serverId/workspace/nodes/paste
```

:::code-group

```ts [TypeScript]
await client.pasteWorkspaceNodes('server-id', {
  nodeIds: ['file-1', 'folder-1'],
  targetParentId: 'destination-folder',
  mode: 'copy',
})
```

```python [Python]
client.paste_workspace_nodes("server-id",
    nodeIds=["file-1", "folder-1"],
    targetParentId="destination-folder",
    mode="copy",
)
```

:::

### 执行命令

```
POST /api/servers/:serverId/workspace/commands
```

:::code-group

```ts [TypeScript]
await client.executeWorkspaceCommands('server-id', {
  commands: [
    { type: 'rename', nodeId: 'file-id', name: 'new-name.txt' },
  ],
})
```

```python [Python]
client.execute_workspace_commands("server-id", commands=[
    {"type": "rename", "nodeId": "file-id", "name": "new-name.txt"},
])
```

:::

---

## 上传文件

```
POST /api/servers/:serverId/workspace/upload
```

多部分上传。字段：`file`（二进制）、`parentId`（可选字符串）。

:::code-group

```ts [TypeScript]
const formData = new FormData()
formData.append('file', fileBlob, 'photo.png')
await client.uploadWorkspaceFile('server-id', formData)
```

```python [Python]
client.upload_workspace_file("server-id", file=open("photo.png", "rb"), parent_id="folder-id")
```

:::
