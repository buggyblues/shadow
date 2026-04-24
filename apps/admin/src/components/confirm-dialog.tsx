import { AlertTriangle } from 'lucide-react'
import { useCallback, useState } from 'react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

let _resolve: ((v: boolean) => void) | null = null

// Global state — a simple module-level hook pattern
let _setState: ((s: ConfirmState | null) => void) | null = null

interface ConfirmState extends ConfirmOptions {
  id: number
}

let _seq = 0

/** Call this anywhere instead of window.confirm() */
export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    _resolve = resolve
    _setState?.({ ...opts, id: ++_seq })
  })
}

/** Mount this once in your app root (or layout) */
export function ConfirmDialogProvider() {
  const [state, setState] = useState<ConfirmState | null>(null)
  _setState = setState

  const respond = useCallback((yes: boolean) => {
    setState(null)
    _resolve?.(yes)
    _resolve = null
  }, [])

  if (!state) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${state.danger ? 'bg-red-100' : 'bg-amber-100'}`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${state.danger ? 'text-red-600' : 'text-amber-600'}`}
            />
          </div>
          <div className="flex-1">
            {state.title && <h3 className="font-semibold text-gray-900">{state.title}</h3>}
            <p className="mt-0.5 text-sm text-gray-500">{state.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            onClick={() => respond(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => respond(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
