import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  confirmLabel,
  confirmingLabel,
  confirmText,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const canConfirm = confirmText ? input === confirmText : true
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(21, 32, 52, 0.95) 0%, rgba(12, 17, 28, 0.98) 100%)',
          border: '1px solid var(--nf-border-strong)',
          boxShadow: 'var(--nf-shadow-glow)',
        }}
      >
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-2xl" style={{ background: 'rgba(255, 63, 108, 0.18)' }}>
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--nf-text-high)' }}>
              {title}
            </h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--nf-text-mid)' }}>
            {message}
          </p>

          {confirmText && (
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: 'var(--nf-text-muted)' }}>
                {t('confirmDialog.typeToConfirm', { text: confirmText })}
              </p>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full rounded-2xl px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--nf-bg-glass-2)',
                  border: '1px solid var(--nf-border)',
                  color: 'var(--nf-text-high)',
                }}
                autoFocus
              />
            </div>
          )}
        </div>
        <div
          className="px-5 py-4 flex justify-end gap-2"
          style={{ borderTop: '1px solid var(--nf-border)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="text-sm px-4 py-2 rounded-2xl border transition-colors"
            style={{
              color: 'var(--nf-text-mid)',
              borderColor: 'var(--nf-border)',
              background: 'transparent',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || isConfirming}
            className="text-sm text-white px-4 py-2 rounded-2xl transition-colors disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #ff3f6c 0%, #ff6b8a 100%)' }}
          >
            {isConfirming ? (confirmingLabel ?? resolvedConfirmLabel) : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
