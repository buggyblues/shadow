import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  confirmingLabel?: string
  /** If set, user must type this text to confirm */
  confirmText?: string
  isConfirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  confirmingLabel,
  confirmText,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [input, setInput] = useState('')
  const canConfirm = confirmText ? input === confirmText : true

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-900/30">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <h2 className="font-semibold">{title}</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">{message}</p>

          {confirmText && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">
                Type <code className="font-mono text-red-400">{confirmText}</code> to confirm:
              </p>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-300 focus:outline-none focus:border-red-500"
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || isConfirming}
            className="text-sm bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded transition-colors"
          >
            {isConfirming ? (confirmingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
