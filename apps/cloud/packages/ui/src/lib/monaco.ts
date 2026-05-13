import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

let configured = false

function createEditorWorker() {
  return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
    type: 'module',
  })
}

function createJsonWorker() {
  return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), {
    type: 'module',
  })
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
      return createEditorWorker()
    },
  }
  configured = true
}
