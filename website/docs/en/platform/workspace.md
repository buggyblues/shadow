# Workspace

Every space has a workspace — a virtual file system for storing files and folders. Apps can be published from workspace contents.

## Get workspace

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

## Update workspace

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

## Get file tree

```
GET /api/servers/:serverId/workspace/tree
```

Returns the full workspace tree structure.

:::code-group

```ts [TypeScript]
const tree = await client.getWorkspaceTree('server-id')
```

```python [Python]
tree = client.get_workspace_tree("server-id")
```

:::

---

## Get workspace stats

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

## List children

```
GET /api/servers/:serverId/workspace/children?parentId=folder-id
```

:::code-group

```ts [TypeScript]
const children = await client.getWorkspaceChildren('server-id', 'parent-folder-id')
```

```python [Python]
children = client.list_workspace_children("server-id", parent_id="parent-folder-id")
```

:::

---

## Batch list children

```
POST /api/servers/:serverId/workspace/children/batch
```

:::code-group

```ts [TypeScript]
const result = await client.batchWorkspaceChildren('server-id', ['folder-1', 'folder-2'])
```

```python [Python]
result = client.batch_list_children("server-id", parent_ids=["folder-1", "folder-2"])
```

:::

---

## Download workspace

```
GET /api/servers/:serverId/workspace/download
```

Downloads the entire workspace as a ZIP file.

:::code-group

```ts [TypeScript]
const blob = await client.downloadWorkspace('server-id')
```

```python [Python]
data = client.download_workspace("server-id")
```

:::

---

## Folders

### Create folder

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

### Update folder

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

### Delete folder

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

### Search folders

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

### Download folder

```
GET /api/servers/:serverId/workspace/folders/:folderId/download
```

Downloads a specific folder as a ZIP file.

:::code-group

```ts [TypeScript]
const blob = await client.downloadWorkspaceFolder('server-id', 'folder-id')
```

```python [Python]
data = client.download_workspace_folder("server-id", "folder-id")
```

:::

---

## Files

### Create file

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

### Get file

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

### Update file

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

### Delete file

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

### Search files

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

### Clone file

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

## Bulk operations

### Paste nodes

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

### Run commands

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
client.run_workspace_commands("server-id", commands=[
    {"type": "rename", "nodeId": "file-id", "name": "new-name.txt"},
])
```

:::

---

## Upload file

```
POST /api/servers/:serverId/workspace/upload
```

Multipart upload. Fields: `file` (binary), `parentId` (optional string).

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
