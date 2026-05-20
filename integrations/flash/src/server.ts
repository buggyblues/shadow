import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createFlashApp } from './server/app.js'

const port = Number(process.env.PORT ?? 4216)
const app = await createFlashApp()

serve({ fetch: app.fetch, port })

console.log(`Flash listening on http://localhost:${port}`)
