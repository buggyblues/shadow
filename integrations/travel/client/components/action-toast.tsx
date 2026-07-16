import { cn } from '../utils/class-names.js'
import { CheckCircle } from './icons.js'

export function ActionToast({ message }: { message: string | null }) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[7200] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl transition xl:bottom-6',
        message ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      <CheckCircle size={18} />
      {message}
    </div>
  )
}
