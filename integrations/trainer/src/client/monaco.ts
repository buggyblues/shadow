import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

let configured = false

function createSameOriginModuleWorker(workerUrl: URL) {
  const blobUrl = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(workerUrl.toString())};`], {
      type: 'text/javascript',
    }),
  )
  const worker = new Worker(blobUrl, { type: 'module' })
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
  return worker
}

function createEditorWorker() {
  return createSameOriginModuleWorker(
    new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
  )
}

function createJsonWorker() {
  return createSameOriginModuleWorker(
    new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
  )
}

function createTypeScriptWorker() {
  return createSameOriginModuleWorker(
    new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url),
  )
}

export function configureMonacoWorkers() {
  if (configured || typeof globalThis === 'undefined') return

  const target = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (_workerId: string, label: string) => Worker
    }
  }

  loader.config({ monaco })
  target.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => {
      if (label === 'json') return createJsonWorker()
      if (label === 'typescript' || label === 'javascript') return createTypeScriptWorker()
      return createEditorWorker()
    },
  }
  configured = true
}
