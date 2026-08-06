import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const postgres = require('postgres')
const sql = postgres('postgres://shadow:shadow@127.0.0.1:5432/shadow')
const serverId = 'cc7f730c-462e-42f8-b930-1e8911b143df'
const demoPhotoNodeId = '41c009c4-e5ab-43f0-98eb-471172ac98e0'
const keepPinnedPhoto = process.env.DEMO_PHOTO_PINNED === '1'

const [server] = await sql`
  select desktop_layout
  from servers
  where id = ${serverId}
`

const layout = structuredClone(server.desktop_layout)
layout.items = (layout.items ?? []).filter((item) => item.id !== `workspace:${demoPhotoNodeId}`)
layout.widgets = (layout.widgets ?? []).filter(
  (widget) =>
    (keepPinnedPhoto ||
      widget.kind !== 'photo' ||
      widget.workspaceFileName !== '巴黎灵感照片.png') &&
    !(widget.kind === 'remote-widget' && widget.sourceId === 'travel:currency'),
)

for (const widget of layout.widgets ?? []) {
  if (widget.id === 'travel-demo-note') {
    widget.x = 388
    widget.y = 76
    widget.content = '## 巴黎周末\n\n- 左岸住哪家\n- 日落游船订周五\n- 周六下雨就去奥赛'
    widget.heightCells = 3
    widget.widthCells = 6
  }
  if (widget.id === 'travel-demo-title') {
    widget.x = 856
    widget.y = 92
    widget.content = '巴黎周末\n聊着聊着，行程就有了'
    widget.fontSize = 28
    widget.widthCells = 7
  }
  if (widget.id === 'travel-demo-chat') {
    widget.x = 388
    widget.y = 524
    widget.widthCells = 9
    widget.heightCells = 2
    widget.placeholder = '问旅行小助手：周六下雨，奥赛之后怎么走？'
    widget.completionItems = ['把群里的决定整理进行程', '安排一个下雨天的下午', '看看还有什么没订']
  }
}

await sql`
  update servers
  set desktop_layout = ${sql.json(layout)}
  where id = ${serverId}
`

console.log(JSON.stringify(layout.widgets, null, 2))
await sql.end()
