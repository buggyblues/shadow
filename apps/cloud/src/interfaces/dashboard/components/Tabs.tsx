import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  count?: number
  icon?: React.ReactNode
}

interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
  variant?: 'default' | 'pills'
}

export function Tabs({ items, active, onChange, className, variant = 'default' }: TabsProps) {
  if (variant === 'pills') {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap', className)}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
              active === item.id ? 'text-white nf-glow' : 'text-gray-400 hover:text-white',
            )}
            style={{
              background:
                active === item.id
                  ? 'linear-gradient(135deg, #00f3ff 0%, #7c4dff 100%)'
                  : 'var(--nf-bg-raised)',
              border: active === item.id ? 'none' : '1px solid var(--nf-border)',
            }}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'text-xs px-1.5 rounded-full',
                  active === item.id ? 'bg-white/15' : 'bg-black/20',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('flex items-center gap-1 rounded-2xl border p-1 overflow-x-auto', className)}
      style={{
        background: 'var(--nf-bg-glass-2)',
        borderColor: 'var(--nf-border)',
        boxShadow: 'var(--nf-shadow-soft)',
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all relative rounded-xl whitespace-nowrap',
            active === item.id ? 'text-white' : 'text-gray-500 hover:text-gray-300',
          )}
          style={{
            background:
              active === item.id
                ? 'linear-gradient(135deg, rgba(0, 243, 255, 0.18) 0%, rgba(124, 77, 255, 0.16) 100%)'
                : 'transparent',
          }}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined && (
            <span
              className="text-xs px-1.5 rounded-full"
              style={{
                color: active === item.id ? 'var(--nf-text-high)' : 'var(--nf-text-muted)',
                background: active === item.id ? 'rgba(255,255,255,0.12)' : 'var(--nf-bg-raised)',
              }}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
