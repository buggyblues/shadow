import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const postgres = require('postgres')

const avatars = [
  {
    userId: '75d47c71-a97c-4621-9326-b7b9d76506a9',
    username: 'chennuo_travel',
    avatarUrl: '/shadow/avatars/354d7dca-30b8-4456-8c57-9a21e4701d76.png',
  },
  {
    userId: '729b92f9-69a8-4dbb-8fee-b88f00decefe',
    username: 'linxia_travel',
    avatarUrl: '/shadow/avatars/1689552d-2535-47cd-ae9f-db25a40a03fa.png',
  },
  {
    userId: '4ba4a4c8-80ec-43fe-be41-29ba54af24ae',
    username: 'zhouyu_travel',
    avatarUrl: '/shadow/avatars/27e8f790-5f43-4d7d-bd35-21fc5b397f92.png',
  },
  {
    userId: '276f8bf7-59d1-4692-81d0-25903b857808',
    username: 'travel_assistant',
    avatarUrl: '/shadow/avatars/05deadc9-55ea-4d16-b75c-d5929abebeee.png',
  },
]

const sql = postgres('postgres://shadow:shadow@127.0.0.1:5432/shadow')

for (const avatar of avatars) {
  await sql`
    update users
    set username = ${avatar.username}, avatar_url = ${avatar.avatarUrl}, updated_at = now()
    where id = ${avatar.userId}
  `
}

const updated = await sql`
  select display_name, avatar_url
  from users
  where id in (
    ${avatars[0].userId},
    ${avatars[1].userId},
    ${avatars[2].userId},
    ${avatars[3].userId}
  )
  order by display_name
`
console.log(JSON.stringify(updated, null, 2))
await sql.end()
