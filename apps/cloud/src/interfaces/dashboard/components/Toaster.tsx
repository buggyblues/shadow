import { Button } from '@shadowob/ui'
import { clsx } from 'clsx'
import { CheckCircle, Info, X, XCircle } from 'lucide-react'
import { useToastStore } from '@/stores/toast'

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

const styles = {
  success: 'border-green-800 bg-green-900/40 text-green-400',
  error: 'border-red-800 bg-red-900/40 text-red-400',
  info: 'border-blue-800 bg-blue-900/40 text-blue-400',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 rounded-lg border text-sm shadow-lg animate-in slide-in-from-right',
              styles[toast.type],
            )}
          >
            <Icon size={16} className="shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <Button
              type="button"
              onClick={() => remove(toast.id)}
              variant="ghost"
              size="xs"
              className="!shrink-0 !opacity-60 hover:!opacity-100"
            >
              <X size={14} />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
