import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { travelManifest } from '../lib/manifest.js'
import type { TravelContext, TravelHonoEnv } from '../types.js'

const fallbackHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Travel</title></head><body><main><h1>Travel</h1><p>Build the client before launching this Space App.</p></main></body></html>`

async function clientHtml() {
  return readFile(new URL('../../../dist/client/index.html', import.meta.url), 'utf8').catch(
    () => fallbackHtml,
  )
}

export function createManifestHandler() {
  const app = new Hono<TravelHonoEnv>()
  app.get('/.well-known/space-app.json', (c) => c.json(travelManifest()))
  const renderClient = async (c: TravelContext) => c.html(await clientHtml())
  app.get('/shadow/server', renderClient)
  app.get('/shadow/server/', renderClient)
  app.get('/shadow/server/*', renderClient)
  app.get('/travel-icon.svg', (c) =>
    c.body(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#173a35"/><path d="M17 42c8-3 11-13 15-25 3 8 7 14 15 18-8 1-14 5-18 12-2-4-6-6-12-5Z" fill="#f3efe6"/><circle cx="45" cy="18" r="6" fill="#ef6a55"/></svg>',
      200,
      { 'content-type': 'image/svg+xml; charset=utf-8' },
    ),
  )
  return app
}
